"""The nodes of Elio's chat graph (ROADMAP 4.3, ARCHITECTURE §4, ADR-0004, ADR-0008).

    router ─┬─ about_ivan ─► retrieval ─► relevance_gate ─┬─ relevant ─► generate ─┐
            │                                             └─ not ─────► no_info ──┤
            └─ greeting / off_topic / injection ─► template ──────────────────────┴─► finish

Why a LangGraph `StateGraph` and not plain calls: the branches (template, no information, answer)
are explicit edges, every node reads and writes only its own keys of a typed state, and the
compiled graph draws itself (`draw_mermaid`) for the docs. The input guard runs before the graph,
in the HTTP layer, because its refusals need an HTTP status (routers/chat.py).

Nodes stream the SSE events themselves through LangGraph's stream writer (`stream_mode="custom"`),
so the answer's tokens reach the visitor as they arrive. Request-scoped dependencies (models,
retriever, settings, the day's spend, the deadline) travel as the run's `context`, not in the
state: the state holds only what nodes compute. The graph is assembled in `graph/assembly.py`.
"""

import asyncio
import operator
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import aclosing
from dataclasses import dataclass, field
from typing import Annotated, Literal, Protocol, TypedDict

from langchain_core.language_models import BaseChatModel
from langgraph.config import get_stream_writer
from langgraph.runtime import Runtime

from site_api.core.config import Settings
from site_api.graph.generate import AnswerDelta, AnswerEnd, AnswerEvent, stream_answer
from site_api.graph.router import RouterError, build_router_messages, route_question
from site_api.graph.sources import recent_history, source_item
from site_api.graph.usage import (
    cautious_cost_usd,
    estimate_cost_usd,
    model_node,
    ms_since,
)
from site_api.prompts.answer import build_answer_messages
from site_api.prompts.localized import template_answer
from site_api.rag.relevance import passes_relevance_gate
from site_api.rag.retrieval import RetrievedChunk
from site_api.schemas.chat import (
    ChatEvent,
    ChatTurn,
    DoneEvent,
    FinishReason,
    NodeUsage,
    Route,
    RouteEvent,
    SourcesEvent,
    TokenEvent,
    UsageEvent,
)


class Retriever(Protocol):
    """What the graph needs from retrieval (`HybridRetriever`; a fake in tests)."""

    async def retrieve(self, question: str) -> list[RetrievedChunk]:
        """The best chunks for the question, best first."""
        ...


class Spend(Protocol):
    """Where every model call's cost goes: the day's spend, which the daily budget checks."""

    def add(self, cost_usd: float) -> None:
        """Count one model call's estimated cost."""
        ...


@dataclass(frozen=True, slots=True)
class ChatModels:
    """The two chat models: the router classifies each question, the answer model writes."""

    router: BaseChatModel
    answer: BaseChatModel


@dataclass(frozen=True, slots=True)
class ChatContext:
    """The run's dependencies, the same for every node; never part of the state."""

    retriever: Retriever
    models: ChatModels
    settings: Settings
    spend: Spend
    # `time.perf_counter()` at the request's start, for `total_ms`.
    started: float
    # The event loop time by which the whole answer must be done (CHAT_TOTAL_TIMEOUT_S). Each
    # node bounds its own waits with it, never a `yield`.
    deadline: float


@dataclass
class ChatState:
    """What the nodes compute; each node returns only the fields it sets.

    A dataclass with defaults rather than a partial TypedDict: a field a node has not set yet
    reads as its default (`None`, empty), and the type checker makes every node handle that.
    """

    question: str
    # `list[ChatTurn]` as a factory makes a new empty list per state (a shared default would leak).
    history: list[ChatTurn] = field(default_factory=list[ChatTurn])
    route: Route | None = None
    language: str = "en"
    retrieved: list[RetrievedChunk] = field(default_factory=list[RetrievedChunk])
    relevant: bool = False
    finish_reason: FinishReason | None = None
    # Appended by every node (the reducer adds lists), summed into the `usage` event.
    nodes: Annotated[list[NodeUsage], operator.add] = field(default_factory=list[NodeUsage])
    cost_usd: Annotated[float, operator.add] = 0.0


class Update(TypedDict, total=False):
    """What a node returns: only the fields it sets; LangGraph merges them into the state.

    Typed key by key (not a plain dict), so a misspelt field is a type error, not an update
    LangGraph silently ignores.
    """

    route: Route
    language: str
    retrieved: list[RetrievedChunk]
    relevant: bool
    finish_reason: FinishReason
    nodes: list[NodeUsage]
    cost_usd: float


def _emit(event: ChatEvent) -> None:
    """Send one SSE event to the reader of the run (`stream_mode="custom"`).

    LangGraph finds the current run's writer through a context variable, so this works inside
    any node of the run. Its queue has no limit (no backpressure): a node keeps running while the
    reader is slow, so the answer model writes to the end; `answer_max_output_tokens` and the
    deadline bound how much piles up.
    """
    get_stream_writer()(event)


# ── Nodes ─────────────────────────────────────────────────────────────────────────────────────


async def router(state: ChatState, runtime: Runtime[ChatContext]) -> Update:
    """Classify the question (`graph/router.py`); fail closed on unusable output."""
    context = runtime.context
    settings = context.settings
    started = time.perf_counter()
    history = recent_history(
        state.history, settings.router_history_turns, settings.history_turn_max_chars
    )
    price = settings.model_prices[settings.router_model]
    try:
        async with asyncio.timeout_at(context.deadline):
            routed = await route_question(
                context.models.router, build_router_messages(state.question, history)
            )
    except RouterError as error:
        # A decision that did not parse was still billed: count it, then fail closed.
        if error.usage is not None:
            context.spend.add(estimate_cost_usd(price, error.usage))
        raise
    cost_usd = estimate_cost_usd(price, routed.usage)
    context.spend.add(cost_usd)
    _emit(RouteEvent(type="route", route=routed.route, language=routed.language))
    return {
        "route": routed.route,
        "language": routed.language,
        "nodes": [model_node("router", started, settings.router_model, routed.usage)],
        "cost_usd": cost_usd,
    }


async def template(state: ChatState) -> Update:
    """Greetings, off-topic and injection: a localized template, no retrieval, no answer model."""
    route = state.route
    if route is None or route == "about_ivan":
        msg = "the template node answers only greeting, off_topic and injection"
        raise RuntimeError(msg)
    _emit(TokenEvent(type="token", text=template_answer(route, state.language)))
    return {"finish_reason": "templated"}


async def retrieval(state: ChatState, runtime: Runtime[ChatContext]) -> Update:
    """Hybrid retrieval of the chunks that best answer the question (`rag/retrieval.py`)."""
    context = runtime.context
    started = time.perf_counter()
    async with asyncio.timeout_at(context.deadline):
        retrieved = await context.retriever.retrieve(state.question)
    return {"retrieved": retrieved, "nodes": [NodeUsage(name="retrieval", ms=ms_since(started))]}


async def relevance_gate(state: ChatState, runtime: Runtime[ChatContext]) -> Update:
    """Keep the answer model away when nothing retrieved is close to the question (4.3)."""
    started = time.perf_counter()
    retrieved = state.retrieved
    relevant = passes_relevance_gate(retrieved, runtime.context.settings.relevance_min_similarity)
    # SPEC §4.2: the sources above the threshold; an empty list announces "no information".
    items = [source_item(item) for item in retrieved] if relevant else []
    _emit(SourcesEvent(type="sources", items=items))
    return {"relevant": relevant, "nodes": [NodeUsage(name="relevance_gate", ms=ms_since(started))]}


async def no_info(state: ChatState) -> Update:
    """The "no information" template with Ivan's contacts (SPEC §5.2)."""
    _emit(TokenEvent(type="token", text=template_answer("no_info", state.language)))
    return {"finish_reason": "no_info"}


async def generate(state: ChatState, runtime: Runtime[ChatContext]) -> Update:
    """Stream the answer grounded in the retrieved chunks (`graph/generate.py`)."""
    context = runtime.context
    settings = context.settings
    started = time.perf_counter()
    history = recent_history(
        state.history, settings.history_max_turns, settings.history_turn_max_chars
    )
    messages = build_answer_messages(
        state.question,
        history,
        [item.chunk for item in state.retrieved],
        provider=settings.answer_provider,
    )
    price = settings.model_prices[settings.answer_model]
    end: AnswerEnd | None = None
    charged = False
    try:
        async with aclosing(stream_answer(context.models.answer, messages)) as answer:
            while (event := await _next_before(answer, context.deadline)) is not None:
                if isinstance(event, AnswerDelta):
                    _emit(TokenEvent(type="token", text=event.text))
                else:
                    end = event
        if end is None:
            msg = "the answer stream ended without its end event"
            raise RuntimeError(msg)
        cost_usd = estimate_cost_usd(price, end.usage)
        context.spend.add(cost_usd)
        charged = True
    finally:
        if not charged:
            # Stopped, failed or timed out mid-answer: the provider may have billed tokens that
            # no `usage` event reports. Count a cautious estimate, or pressing Stop just before
            # the end would make answers free for the daily budget.
            context.spend.add(cautious_cost_usd(price, messages, settings.answer_max_output_tokens))
    return {
        "finish_reason": end.finish_reason,
        "nodes": [model_node("generate", started, settings.answer_model, end.usage)],
        "cost_usd": cost_usd,
    }


async def finish(state: ChatState, runtime: Runtime[ChatContext]) -> Update:
    """The `usage` event (every step, total time, estimated cost), then `done`."""
    _emit(
        UsageEvent(
            type="usage",
            nodes=state.nodes,
            total_ms=ms_since(runtime.context.started),
            estimated_cost_usd=round(state.cost_usd, 6),
        )
    )
    if state.finish_reason is None:
        msg = "the graph reached `finish` without a finish reason"
        raise RuntimeError(msg)
    _emit(DoneEvent(type="done", message_id=uuid.uuid4(), finish_reason=state.finish_reason))
    return {}


async def _next_before(events: AsyncGenerator[AnswerEvent], deadline: float) -> AnswerEvent | None:
    """The next event of the answer, `None` at its end; `TimeoutError` past the deadline."""
    async with asyncio.timeout_at(deadline):
        return await anext(events, None)


# ── Edges ─────────────────────────────────────────────────────────────────────────────────────


def after_router(state: ChatState) -> Literal["retrieval", "template"]:
    """Only questions about Ivan go on to retrieval (ADR-0004 layer 2)."""
    return "retrieval" if state.route == "about_ivan" else "template"


def after_gate(state: ChatState) -> Literal["generate", "no_info"]:
    """Only relevant context reaches the answer model (ADR-0004 layer 3)."""
    return "generate" if state.relevant else "no_info"
