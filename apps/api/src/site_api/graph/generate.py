"""The generate step: stream the answer model's reply (ROADMAP 3.7).

The API turns these events into SSE: each `AnswerDelta` becomes a `token` event, and `AnswerEnd`
feeds `usage` and `done` (SPEC §4). The events are plain dataclasses, not LangChain objects, so
the rest of the API never depends on how a provider shapes its stream.
"""

from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage


@dataclass(frozen=True, slots=True)
class TokenUsage:
    """Tokens one model call used; cached input is part of `input_tokens`."""

    input_tokens: int
    cached_input_tokens: int
    output_tokens: int


@dataclass(frozen=True, slots=True)
class AnswerDelta:
    """A piece of the answer text, as the model streams it."""

    text: str


@dataclass(frozen=True, slots=True)
class AnswerEnd:
    """The end of the answer: why it ended and what it cost in tokens."""

    finish_reason: Literal["stop", "length"]
    usage: TokenUsage


type AnswerEvent = AnswerDelta | AnswerEnd

# How the providers say "cut by the token limit": OpenAI `finish_reason: length`, Anthropic
# `stop_reason: max_tokens`.
CUT_BY_TOKEN_LIMIT = frozenset({"length", "max_tokens"})


async def stream_answer(
    model: BaseChatModel, messages: Sequence[BaseMessage]
) -> AsyncGenerator[AnswerEvent]:
    """Stream the answer: text deltas, then one `AnswerEnd`."""
    # `astream` yields AIMessageChunk pieces. Adding chunks (`+`) merges their metadata too, so
    # the finish reason and the token counts, which come on the last chunks, end up in `answer`.
    answer: AIMessageChunk | None = None
    chunks = model.astream(messages)
    try:
        async for chunk in chunks:
            if chunk.text:
                yield AnswerDelta(chunk.text)
            answer = chunk if answer is None else answer + chunk
    finally:
        # When the reader stops early (the visitor pressed Stop and the API closes this
        # generator), close the provider's stream right away too, so its HTTP request ends and no
        # more tokens are generated or billed; otherwise it lingers until garbage collection.
        # `astream` is typed as a plain iterator, but it is an async generator, which can close.
        if isinstance(chunks, AsyncGenerator):
            await chunks.aclose()
    yield AnswerEnd(finish_reason=_finish_reason(answer), usage=token_usage(answer))


def _finish_reason(answer: AIMessageChunk | None) -> Literal["stop", "length"]:
    """`length` when the provider cut the answer at the token limit, `stop` otherwise."""
    if answer is None:
        return "stop"
    metadata = answer.response_metadata
    reason: object = metadata.get("finish_reason") or metadata.get("stop_reason")
    return "length" if reason in CUT_BY_TOKEN_LIMIT else "stop"


def token_usage(answer: AIMessage | None) -> TokenUsage:
    """The token counts of one model call; zeros if the provider sent none.

    Shared by the answer (the merged streamed chunks) and the router (its one raw message).
    """
    if answer is None or answer.usage_metadata is None:
        return TokenUsage(input_tokens=0, cached_input_tokens=0, output_tokens=0)
    usage = answer.usage_metadata
    details = usage.get("input_token_details", {})
    return TokenUsage(
        input_tokens=usage["input_tokens"],
        cached_input_tokens=details.get("cache_read", 0),
        output_tokens=usage["output_tokens"],
    )
