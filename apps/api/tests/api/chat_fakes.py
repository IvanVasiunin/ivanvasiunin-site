"""Fakes for the chat tests: a retriever with fixed results and a model with a scripted stream.

No test calls a real model, embedding API or database (langchain-rag.md).
"""

import asyncio
from collections.abc import AsyncIterator, Sequence

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.messages.ai import UsageMetadata
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_core.runnables import RunnableLambda
from pydantic import Field

from site_api.graph.router import RouterDecision
from site_api.rag.retrieval import RetrievedChunk
from site_api.rag.search import Candidate
from site_api.schemas.chat import Route

BRAINROCKET = Candidate(
    chunk_id="cv:brainrocket:0",
    content="Builds and reviews UI\nfor iGaming platforms.",
    source_type="cv",
    category="job",
    section="BrainRocket",
    project=None,
    url="/cv#brainrocket",
    # Close to the question: the relevance gate lets it through.
    similarity=0.62,
)
SKILLS = Candidate(
    chunk_id="experience:skills:1",
    content="HTML, SCSS, TypeScript, React.",
    source_type="experience",
    category="skills",
    section="Skills",
    project=None,
    url=None,
    similarity=0.48,
)
RETRIEVED = [RetrievedChunk(BRAINROCKET, 0.83), RetrievedChunk(SKILLS, 0.5)]

USAGE: UsageMetadata = {
    "input_tokens": 1200,
    "output_tokens": 40,
    "total_tokens": 1240,
    "input_token_details": {"cache_read": 1000},
}


class FakeRetriever:
    """Returns fixed chunks, or raises `error`; remembers the questions it was asked."""

    def __init__(
        self, chunks: Sequence[RetrievedChunk] = RETRIEVED, error: Exception | None = None
    ) -> None:
        self.chunks: list[RetrievedChunk] = list(chunks)
        self.error: Exception | None = error
        self.questions: list[str] = []

    async def retrieve(self, question: str) -> list[RetrievedChunk]:
        self.questions.append(question)
        if self.error is not None:
            raise self.error
        return self.chunks

    async def retrieve_many(self, queries: Sequence[str]) -> list[RetrievedChunk]:
        """Every query is remembered; the fixed chunks come back once."""
        for query in queries[:-1]:
            self.questions.append(query)
        return await self.retrieve(queries[-1])


class StreamingFakeModel(BaseChatModel):
    """Streams the given chunks (metadata included), then raises `error` if one is set.

    With `hang_after`, it stops after that many chunks and waits forever, like a provider that
    stalls mid-answer: only a timeout or a cancellation ends it.
    """

    chunks: list[AIMessageChunk]
    error: Exception | None = None
    hang_after: int | None = None
    received: list[list[BaseMessage]] = Field(default_factory=list[list[BaseMessage]])
    closed: bool = False

    @property
    def _llm_type(self) -> str:
        return "streaming-fake"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> ChatResult:
        raise NotImplementedError

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> AsyncIterator[ChatGenerationChunk]:
        self.received.append(list(messages))
        try:
            for index, chunk in enumerate(self.chunks):
                if index == self.hang_after:
                    await asyncio.Event().wait()
                yield ChatGenerationChunk(message=chunk)
            if self.error is not None:
                raise self.error
        finally:
            self.closed = True


def answering(
    *texts: str,
    finish_reason: str = "stop",
    error: Exception | None = None,
    hang_after: int | None = None,
) -> StreamingFakeModel:
    """A model that streams `texts`, then a finish reason and the token counts, as OpenAI does."""
    chunks = [AIMessageChunk(content=text) for text in texts]
    if error is None:
        chunks.append(
            AIMessageChunk(content="", response_metadata={"finish_reason": finish_reason})
        )
        chunks.append(AIMessageChunk(content="", usage_metadata=USAGE))
    return StreamingFakeModel(chunks=chunks, error=error, hang_after=hang_after)


# What the router "costs" in the fakes: a short prompt in, a few tokens of JSON out.
ROUTER_USAGE: UsageMetadata = {
    "input_tokens": 400,
    "output_tokens": 12,
    "total_tokens": 412,
    "input_token_details": {"cache_read": 0},
}


class FakeRouterModel(BaseChatModel):
    """A router whose structured output is fixed: `decision`, or none at all (a parse failure).

    Only `with_structured_output` is used by the router, so only it is faked: it returns what
    LangChain returns with `include_raw=True` — the raw message with the token counts, the parsed
    decision and the parsing error.
    """

    decision: RouterDecision | None = RouterDecision(
        route="about_ivan", language="en", search_queries=["Ivan"]
    )
    error: Exception | None = None
    # Never answers, like a stalled provider: only the deadline ends the wait.
    hang: bool = False
    received: list[list[BaseMessage]] = Field(default_factory=list[list[BaseMessage]])

    @property
    def _llm_type(self) -> str:
        return "router-fake"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> ChatResult:
        raise NotImplementedError

    def with_structured_output(  # pyright: ignore[reportIncompatibleMethodOverride] -- a fake: the base returns a broader Runnable type
        self, schema: dict[str, object] | type, *, include_raw: bool = False, **kwargs: object
    ) -> RunnableLambda[list[BaseMessage], dict[str, object]]:
        async def run(messages: list[BaseMessage]) -> dict[str, object]:
            self.received.append(list(messages))
            if self.hang:
                await asyncio.Event().wait()
            if self.error is not None:
                raise self.error
            raw = AIMessage(content="", usage_metadata=ROUTER_USAGE)
            return {"raw": raw, "parsed": self.decision, "parsing_error": None}

        return RunnableLambda(run)


def routing(
    route: Route = "about_ivan", language: str = "en", search_queries: Sequence[str] = ()
) -> FakeRouterModel:
    """A router that sends every question to `route`, in `language`, with this search query."""
    decision = RouterDecision(route=route, language=language, search_queries=list(search_queries))
    return FakeRouterModel(decision=decision)
