"""The answer stream of `POST /api/chat`: runs Elio's graph and guards its end (SPEC §4).

The graph (`graph/assembly.py`, `graph/nodes.py`) does the work: router, retrieval, relevance
gate, answer or template, usage, done. This service wires its dependencies once at startup and,
for each request, turns any failure into one terminal `error` event (SPEC §4.2): by then the HTTP
status is already sent, so the error travels as an event. The visitor's Stop closes this
generator, and closing it closes the graph's run and the provider's stream too.
"""

import asyncio
import logging
import time
from collections.abc import AsyncGenerator, Sequence
from contextlib import aclosing
from dataclasses import dataclass

import anthropic
import openai
from langchain_core.callbacks import BaseCallbackHandler
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.ext.asyncio import AsyncEngine

from site_api.core.config import Settings
from site_api.core.errors import log_unexpected_error
from site_api.graph.assembly import ChatGraph, build_chat_graph, run_chat
from site_api.graph.models import ModelConfigError, build_answer_model, build_router_model
from site_api.graph.nodes import ChatContext, ChatModels, Retriever, Spend
from site_api.graph.router import RouterError, load_router_prompt
from site_api.ingestion.embeddings import create_embeddings
from site_api.prompts.answer import load_system_prompt
from site_api.prompts.localized import warm_up as warm_up_templates
from site_api.rag.retrieval import HybridRetriever, RetrievalParams
from site_api.rag.search import PostgresChunkSearch
from site_api.schemas.chat import ChatEvent, ChatRequest, ErrorEvent
from site_api.schemas.errors import ErrorCode
from site_api.services.stats import AnswerRecord, StatsRecorder, answer_record

logger: logging.Logger = logging.getLogger(__name__)

# The route in log lines (the request context middleware logs the same template).
_ROUTE = "/api/chat"

# Safe, user-facing text for the errors the stream can end with.
_ERROR_MESSAGES: dict[ErrorCode, str] = {
    "timeout": "The answer took too long. Please try again.",
    "upstream_unavailable": "Elio is unavailable right now. Please try again in a minute.",
    "internal": "Something went wrong on our side. Please try again.",
}

# Provider and database failures that are not our bug: the service behind is slow or down.
# `APITimeoutError` is a kind of `APIConnectionError`, so timeouts are checked first.
_TIMEOUTS: tuple[type[Exception], ...] = (
    TimeoutError,
    openai.APITimeoutError,
    anthropic.APITimeoutError,
)
_UNAVAILABLE: tuple[type[Exception], ...] = (
    openai.APIConnectionError,
    openai.InternalServerError,
    openai.RateLimitError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
    anthropic.OverloadedError,
    anthropic.ServiceUnavailableError,
    anthropic.RateLimitError,
    # The database is down or the connection broke; or every pooled connection is busy for
    # DB_POOL_TIMEOUT_S (SQLAlchemy's own TimeoutError, not the built-in one).
    OperationalError,
    InterfaceError,
    PoolTimeoutError,
    # The router gave no usable decision: fail closed, as if the router were down (ADR-0004).
    RouterError,
)


@dataclass(frozen=True, slots=True)
class ChatObservers:
    """What watches every answer without taking part in it: statistics rows and tracing."""

    stats: StatsRecorder | None = None
    callbacks: Sequence[BaseCallbackHandler] = ()


class ChatService:
    """Answers one question as a stream of SSE events; one instance serves every request."""

    def __init__(
        self,
        retriever: Retriever,
        models: ChatModels,
        settings: Settings,
        spend: Spend,
        observers: ChatObservers | None = None,
    ) -> None:
        """Use these dependencies (all created once, at startup) and compile the graph once.

        Every model call's estimated cost is added to `spend`, which the daily budget checks;
        `observers` (statistics, tracing) see every answer.
        """
        observers = observers or ChatObservers()
        self._retriever = retriever
        self._models = models
        self._settings = settings
        self._spend = spend
        self._stats = observers.stats
        # Tracing (services/tracing.py), when Langfuse is configured; it sees every run.
        self._callbacks = tuple(observers.callbacks)
        self._graph: ChatGraph = build_chat_graph()
        # Pending statistics writes: held here so they are not garbage-collected mid-write.
        self._writes: set[asyncio.Task[None]] = set()

    async def answer(self, request: ChatRequest) -> AsyncGenerator[ChatEvent]:
        """Stream the events of one answer, in the order of SPEC §4.1."""
        context = ChatContext(
            retriever=self._retriever,
            models=self._models,
            settings=self._settings,
            spend=self._spend,
            started=time.perf_counter(),
            # One deadline for the whole answer (CHAT_TOTAL_TIMEOUT_S); every node bounds its own
            # waits with it.
            deadline=asyncio.get_running_loop().time() + self._settings.chat_total_timeout_s,
        )
        seen: list[ChatEvent] = []
        try:
            # `aclosing`: when this generator is closed (Stop), `async for` alone would leave the
            # graph's run suspended, and the provider's stream open until garbage collection.
            run = run_chat(self._graph, request.message, request.history, context, self._callbacks)
            async with aclosing(run) as events:
                async for event in events:
                    seen.append(event)
                    yield event
        except Exception as error:
            # Only `Exception`: Stop (GeneratorExit) and cancellation are not errors.
            failure = error_event(error)
            seen.append(failure)
            yield failure
        finally:
            # Finished, failed or stopped: one row either way, written in the background, so a
            # slow or failing database never delays or breaks an answer.
            self._record(answer_record(request.message, seen))

    def _record(self, record: AnswerRecord) -> None:
        """Hand one record to the statistics without waiting for it."""
        if self._stats is None:
            return
        task = asyncio.get_running_loop().create_task(_write(self._stats, record))
        self._writes.add(task)
        task.add_done_callback(self._writes.discard)

    async def drain(self) -> None:
        """Wait for the pending statistics writes (shutdown, tests)."""
        if self._writes:
            await asyncio.gather(*self._writes)


async def _write(stats: StatsRecorder, record: AnswerRecord) -> None:
    """Write one record; a failure is logged (by type only) and dropped."""
    try:
        await stats.record(record)
    except Exception as error:
        logger.warning("chat statistics write failed", extra={"error_type": type(error).__name__})


def create_chat_service(
    settings: Settings,
    engine: AsyncEngine,
    spend: Spend,
    observers: ChatObservers | None = None,
) -> ChatService | None:
    """The app's chat service, or `None` when a model API key is missing.

    Without a key the rest of the API (health) still works, and `/api/chat` answers 503: a local
    run without keys, or a deploy with a missing secret, shows up in the log, not as a crash.
    """
    try:
        embeddings = create_embeddings(settings)
    except ValueError as error:
        # `create_embeddings` raises ValueError when OPENAI_API_KEY is not set.
        logger.warning(
            "chat is off: the embedding model has no API key",
            extra={"error_type": type(error).__name__},
        )
        return None
    try:
        models = ChatModels(
            router=build_router_model(settings), answer=build_answer_model(settings)
        )
    except ModelConfigError as error:
        logger.warning(
            "chat is off: a chat model has no API key",
            extra={"error_type": type(error).__name__},
        )
        return None
    # Read the prompt and template files now, at startup, so no request waits on disk I/O; a
    # broken file fails here, not in a visitor's answer.
    load_router_prompt()
    load_system_prompt()
    warm_up_templates()
    retriever = HybridRetriever(
        PostgresChunkSearch(engine), embeddings, RetrievalParams.from_settings(settings)
    )
    return ChatService(retriever, models, settings, spend, observers)


def error_code(error: Exception) -> ErrorCode:
    """The SPEC §4.2 code for a failure: slow provider, unavailable service, or our own bug."""
    if isinstance(error, _TIMEOUTS):
        return "timeout"
    if isinstance(error, _UNAVAILABLE):
        return "upstream_unavailable"
    return "internal"


def error_event(error: Exception) -> ErrorEvent:
    """Log the failure (type and stack only, never its message) and build the `error` event."""
    code = error_code(error)
    if code == "internal":
        log_unexpected_error(_ROUTE, error)
    else:
        logger.warning(
            "chat answer failed",
            extra={"route": _ROUTE, "error_code": code, "error_type": type(error).__name__},
        )
    return ErrorEvent(type="error", code=code, message=_ERROR_MESSAGES[code])
