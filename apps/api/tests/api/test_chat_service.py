"""The chat service's parts below the HTTP layer: Stop, history cap, snippets, cost, error codes."""

import asyncio
import uuid

import anthropic
import httpx2
import openai
import pytest
from pydantic import SecretStr
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.ext.asyncio import create_async_engine

from site_api.core.config import ModelPrice, Settings
from site_api.graph.generate import TokenUsage
from site_api.graph.nodes import ChatModels
from site_api.graph.sources import recent_history, snippet
from site_api.graph.usage import estimate_cost_usd
from site_api.schemas.chat import ChatRequest, ChatTurn, ErrorEvent, TokenEvent
from site_api.services.chat import ChatService, create_chat_service, error_code
from site_api.services.limits import DailySpend

from .chat_fakes import FakeRetriever, answering, routing

OPENAI_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
ANTHROPIC_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def request(message: str = "What does Ivan do?") -> ChatRequest:
    return ChatRequest(message=message, session_id=uuid.uuid4())


async def test_stop_closes_the_providers_stream_at_once(settings: Settings) -> None:
    # The visitor pressed Stop: the server closes the answer stream, and the provider's request
    # must end too, or it keeps generating (and billing) tokens nobody reads (SPEC §4.2).
    # Stalls after its first piece, like a provider mid-answer: Stop comes while it streams.
    model = answering("Ivan ", "builds ", "UI.", hang_after=1)
    events = ChatService(
        FakeRetriever(), ChatModels(routing(), model), settings, DailySpend(1.0)
    ).answer(request())

    async for event in events:
        if isinstance(event, TokenEvent):
            break
    await events.aclose()

    assert model.closed


async def test_cancelling_while_the_provider_stalls_closes_its_stream(settings: Settings) -> None:
    # A client disconnect cancels the task reading the answer, typically while it waits for the
    # provider's next chunk; the provider's stream must close then too.
    model = answering("Ivan ", "builds UI.", hang_after=1)
    first_token = asyncio.Event()

    async def read() -> None:
        async for event in ChatService(
            FakeRetriever(), ChatModels(routing(), model), settings, DailySpend(1.0)
        ).answer(request()):
            if isinstance(event, TokenEvent):
                first_token.set()

    reader = asyncio.create_task(read())
    await first_token.wait()
    reader.cancel()
    with pytest.raises(asyncio.CancelledError):
        await reader

    assert model.closed


async def test_an_answer_past_the_total_deadline_ends_with_a_timeout(settings: Settings) -> None:
    quick = settings.model_copy(update={"chat_total_timeout_s": 0.05})
    model = answering("Ivan ", "builds UI.", hang_after=1)

    events = [
        event
        async for event in ChatService(
            FakeRetriever(), ChatModels(routing(), model), quick, DailySpend(1.0)
        ).answer(request())
    ]

    assert [event.type for event in events] == ["route", "sources", "token", "error"]
    end = events[-1]
    assert isinstance(end, ErrorEvent)
    assert end.code == "timeout"
    assert model.closed


def test_the_history_keeps_only_the_last_turns_oldest_first() -> None:
    history = [ChatTurn(role="user", content=f"turn {index}") for index in range(5)]

    assert [turn.content for turn in recent_history(history, 2, 100)] == ["turn 3", "turn 4"]
    assert recent_history(history, 10, 100) == history


def test_a_history_limit_of_zero_sends_no_history() -> None:
    # `history[-0:]` would be the whole list.
    history = [ChatTurn(role="user", content="turn 0")]

    assert recent_history(history, 0, 100) == []


def test_a_long_history_turn_is_cut_to_the_limit() -> None:
    # Client history is untrusted: a few long made-up turns must not multiply the cost.
    history = [ChatTurn(role="assistant", content="x" * 50), ChatTurn(role="user", content="ok")]

    cut, short = recent_history(history, 6, 10)

    assert cut == ChatTurn(role="assistant", content="x" * 9 + "…")
    assert short == history[1]


def test_a_snippet_is_one_line_and_at_most_200_characters() -> None:
    long = "word " * 100

    cut = snippet(long)

    assert len(cut) <= 200
    assert cut.endswith("…")
    assert snippet("Line one.\n\n  Line two.") == "Line one. Line two."


def test_the_cost_prices_fresh_cached_and_output_tokens_separately() -> None:
    price = ModelPrice(input=1.0, cached_input=0.05, output=5.0)
    usage = TokenUsage(input_tokens=1200, cached_input_tokens=1000, output_tokens=40)

    # 200 fresh * $1 + 1000 cached * $0.05 + 40 out * $5, per 1M tokens.
    assert estimate_cost_usd(price, usage) == pytest.approx(0.00045)


def test_without_usage_the_cost_is_zero() -> None:
    price = ModelPrice(input=1.0, cached_input=0.05, output=5.0)

    assert estimate_cost_usd(price, TokenUsage(0, 0, 0)) == 0


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (TimeoutError(), "timeout"),
        (openai.APITimeoutError(request=OPENAI_REQUEST), "timeout"),
        (anthropic.APITimeoutError(request=ANTHROPIC_REQUEST), "timeout"),
        (openai.APIConnectionError(request=OPENAI_REQUEST), "upstream_unavailable"),
        (anthropic.APIConnectionError(request=ANTHROPIC_REQUEST), "upstream_unavailable"),
        (OperationalError("SELECT", None, ConnectionRefusedError()), "upstream_unavailable"),
        (InterfaceError("SELECT", None, ConnectionResetError()), "upstream_unavailable"),
        (PoolTimeoutError("pool exhausted"), "upstream_unavailable"),
        (ValueError("a bug"), "internal"),
    ],
    ids=[
        "timeout",
        "openai-timeout",
        "anthropic-timeout",
        "openai-down",
        "anthropic-down",
        "database-down",
        "database-connection-lost",
        "database-pool-busy",
        "our-bug",
    ],
)
def test_each_failure_maps_to_its_error_code(error: Exception, code: str) -> None:
    assert error_code(error) == code


def test_without_model_keys_there_is_no_chat_service(settings: Settings) -> None:
    engine = create_async_engine(settings.database_url.get_secret_value())

    assert create_chat_service(settings, engine, DailySpend(1.0)) is None


def test_with_the_keys_the_chat_service_is_built_without_any_call(settings: Settings) -> None:
    # Building the clients makes no network request; the placeholder key is never sent.
    keyed = settings.model_copy(update={"openai_api_key": SecretStr("sk-test-placeholder")})
    engine = create_async_engine(settings.database_url.get_secret_value())

    assert isinstance(create_chat_service(keyed, engine, DailySpend(1.0)), ChatService)


async def test_an_answer_stopped_midway_still_counts_toward_the_daily_budget(
    settings: Settings,
) -> None:
    # Stop just before the end must not make answers free for the budget: the provider has
    # already billed the tokens, and no `usage` event will report them.
    spend = DailySpend(1.0)
    events = ChatService(
        FakeRetriever(),
        ChatModels(routing(), answering("Ivan ", "builds UI.", hang_after=1)),
        settings,
        spend,
    ).answer(request())
    async for event in events:
        if isinstance(event, TokenEvent):
            break
    await events.aclose()

    # At least the full output at the answer model's price.
    price = settings.model_prices[settings.answer_model]
    assert spend.spent_usd >= settings.answer_max_output_tokens * price.output / 1_000_000


async def test_an_answer_failed_midway_still_counts_toward_the_daily_budget(
    settings: Settings,
) -> None:
    spend = DailySpend(1.0)
    model = answering("Ivan ", error=openai.APIConnectionError(request=OPENAI_REQUEST))

    events = [
        e
        async for e in ChatService(
            FakeRetriever(), ChatModels(routing(), model), settings, spend
        ).answer(request())
    ]

    assert isinstance(events[-1], ErrorEvent)
    assert spend.spent_usd > 0


async def test_a_failed_retrieval_costs_the_budget_only_the_router_call(
    settings: Settings,
) -> None:
    # The answer model was never called, so only the router's few tokens were billed.
    spend = DailySpend(1.0)
    retriever = FakeRetriever(error=OperationalError("SELECT", None, ConnectionRefusedError()))

    _ = [
        e
        async for e in ChatService(
            retriever, ChatModels(routing(), answering("Hi")), settings, spend
        ).answer(request())
    ]

    # gpt-6-luna: 400 in * $0.10 + 12 out * $0.50, per 1M tokens.
    assert spend.spent_usd == pytest.approx(0.000046)
