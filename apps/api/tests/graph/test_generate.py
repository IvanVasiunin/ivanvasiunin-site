"""Streaming the answer: text deltas in order, then one end event with usage (ROADMAP 3.7).

The scripted model streams chunks shaped like the providers' own: OpenAI puts `finish_reason` in
the response metadata and the token counts on a last, empty chunk; Anthropic calls it
`stop_reason` and says `max_tokens` when an answer is cut.
"""

import pytest
from langchain_core.messages import AIMessageChunk, HumanMessage
from langchain_core.messages.ai import UsageMetadata

from site_api.graph.generate import AnswerDelta, AnswerEnd, AnswerEvent, TokenUsage, stream_answer

from .conftest import scripted, texts

MESSAGES = [HumanMessage("What does Ivan do?")]

USAGE: UsageMetadata = {
    "input_tokens": 1200,
    "output_tokens": 40,
    "total_tokens": 1240,
    "input_token_details": {"cache_read": 1000},
}


async def collect(*chunks: AIMessageChunk) -> list[AnswerEvent]:
    return [event async for event in stream_answer(scripted(*chunks), MESSAGES)]


async def test_text_arrives_as_deltas_in_order_without_empty_ones() -> None:
    events = await collect(*texts(["Ivan ", "", "builds UI."]))

    assert [event for event in events if isinstance(event, AnswerDelta)] == [
        AnswerDelta("Ivan "),
        AnswerDelta("builds UI."),
    ]


async def test_the_answer_ends_with_one_end_event_carrying_the_usage() -> None:
    events = await collect(
        *texts(["Ivan builds UI."]),
        AIMessageChunk(content="", response_metadata={"finish_reason": "stop"}),
        AIMessageChunk(content="", usage_metadata=USAGE),
    )

    assert events[-1] == AnswerEnd(
        finish_reason="stop",
        usage=TokenUsage(input_tokens=1200, cached_input_tokens=1000, output_tokens=40),
    )
    assert sum(isinstance(event, AnswerEnd) for event in events) == 1


@pytest.mark.parametrize(
    "metadata",
    [{"finish_reason": "length"}, {"stop_reason": "max_tokens"}],
    ids=["openai", "anthropic"],
)
async def test_an_answer_cut_by_the_token_limit_ends_with_length(
    metadata: dict[str, str],
) -> None:
    events = await collect(
        *texts(["Ivan builds"]), AIMessageChunk(content="", response_metadata=metadata)
    )

    end = events[-1]
    assert isinstance(end, AnswerEnd)
    assert end.finish_reason == "length"


async def test_without_usage_from_the_provider_the_counts_are_zero() -> None:
    events = await collect(*texts(["Hi."]))

    assert events[-1] == AnswerEnd(
        finish_reason="stop",
        usage=TokenUsage(input_tokens=0, cached_input_tokens=0, output_tokens=0),
    )


async def test_the_model_receives_the_messages_unchanged() -> None:
    model = scripted(*texts(["Hi."]))

    _ = [event async for event in stream_answer(model, MESSAGES)]

    assert model.received == [MESSAGES]


async def test_stopping_early_closes_the_providers_stream_at_once() -> None:
    # The visitor pressed Stop: the API closes the answer, and the provider's request must end
    # too, or it keeps generating (and billing) tokens nobody reads.
    model = scripted(*texts(["Ivan ", "builds ", "UI."]))
    answer = stream_answer(model, MESSAGES)

    first = await anext(answer)
    await answer.aclose()

    assert first == AnswerDelta("Ivan ")
    assert model.closed
