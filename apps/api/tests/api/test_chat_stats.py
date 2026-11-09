"""Chat statistics (ROADMAP 4.6, SPEC §6.6): one masked row per answer, deleted after retention.

The recorder and the purger are fakes here; the SQL runs on a live Postgres in
`tests/db/test_stats_db.py` (marker `db`).
"""

import asyncio
import uuid

import httpx2
import openai
import pytest

from site_api.core.config import Settings
from site_api.graph.nodes import ChatModels
from site_api.schemas.chat import ChatRequest, TokenEvent
from site_api.services.chat import ChatObservers, ChatService
from site_api.services.limits import DailySpend
from site_api.services.stats import AnswerRecord, retention_loop

from .chat_fakes import FakeRetriever, FakeRouterModel, answering, routing

OPENAI_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")


class FakeStats:
    """Keeps every record; can be told to fail like a database that is down."""

    def __init__(self, fail: bool = False) -> None:
        self.records: list[AnswerRecord] = []
        self.fail = fail

    async def record(self, record: AnswerRecord) -> None:
        if self.fail:
            raise ConnectionRefusedError
        self.records.append(record)


def request(message: str) -> ChatRequest:
    return ChatRequest(message=message, session_id=uuid.uuid4())


def service(settings: Settings, stats: FakeStats, models: ChatModels) -> ChatService:
    return ChatService(
        FakeRetriever(), models, settings, DailySpend(1.0), ChatObservers(stats=stats)
    )


async def ask(chat: ChatService, message: str) -> None:
    _ = [event async for event in chat.answer(request(message))]
    await chat.drain()


async def test_an_answer_becomes_one_row_with_the_question_masked(settings: Settings) -> None:
    stats = FakeStats()
    chat = service(settings, stats, ChatModels(routing(), answering("Ivan builds UI.")))

    await ask(chat, "Ivan, write me at jane@example.com about https://example.com")

    (record,) = stats.records
    assert record.question_masked == "Ivan, write me at [email] about [url]"
    assert (record.route, record.language, record.finish_reason) == ("about_ivan", "en", "stop")
    assert record.error_code is None
    assert record.cost_usd > 0
    assert record.total_ms is not None


async def test_a_template_and_a_failure_are_counted_too(settings: Settings) -> None:
    stats = FakeStats()
    greeting = service(settings, stats, ChatModels(routing("greeting"), answering("unused")))
    failing = service(
        settings,
        stats,
        ChatModels(
            FakeRouterModel(error=openai.APIConnectionError(request=OPENAI_REQUEST)), answering("x")
        ),
    )

    await ask(greeting, "Hi!")
    await ask(failing, "What does Ivan do?")

    templated, failed = stats.records
    assert (templated.route, templated.finish_reason) == ("greeting", "templated")
    assert (failed.route, failed.error_code) == (None, "upstream_unavailable")


async def test_a_stopped_answer_is_counted_without_an_end(settings: Settings) -> None:
    stats = FakeStats()
    chat = service(
        settings, stats, ChatModels(routing(), answering("Ivan ", "builds UI.", hang_after=1))
    )
    events = chat.answer(request("What does Ivan do?"))

    async for event in events:
        if isinstance(event, TokenEvent):
            break
    await events.aclose()
    await chat.drain()

    (record,) = stats.records
    assert record.route == "about_ivan"
    assert (record.finish_reason, record.error_code) == (None, None)


async def test_a_failing_database_never_breaks_the_answer(settings: Settings) -> None:
    chat = service(settings, FakeStats(fail=True), ChatModels(routing(), answering("Hi.")))

    events = [event async for event in chat.answer(request("What does Ivan do?"))]
    await chat.drain()

    assert events[-1].type == "done"


async def test_without_statistics_nothing_is_recorded(settings: Settings) -> None:
    chat = ChatService(
        FakeRetriever(), ChatModels(routing(), answering("Hi.")), settings, DailySpend(1.0)
    )

    await ask(chat, "What does Ivan do?")


# ── Retention ─────────────────────────────────────────────────────────────────────────────────


class FakePurger:
    def __init__(self, failures: int = 0) -> None:
        self.calls: list[int] = []
        self.failures = failures

    async def purge(self, older_than_days: int) -> int:
        self.calls.append(older_than_days)
        if len(self.calls) <= self.failures:
            raise ConnectionRefusedError
        return 3


async def test_retention_purges_at_once_and_then_again_after_each_interval() -> None:
    purger = FakePurger()
    job = asyncio.create_task(retention_loop(purger, older_than_days=30, interval_s=0.01))

    await asyncio.sleep(0.05)
    job.cancel()
    with pytest.raises(asyncio.CancelledError):
        await job

    assert len(purger.calls) >= 2
    assert set(purger.calls) == {30}


async def test_retention_survives_a_failed_run() -> None:
    purger = FakePurger(failures=1)
    job = asyncio.create_task(retention_loop(purger, older_than_days=30, interval_s=0.01))

    await asyncio.sleep(0.05)
    job.cancel()
    with pytest.raises(asyncio.CancelledError):
        await job

    assert len(purger.calls) >= 2
