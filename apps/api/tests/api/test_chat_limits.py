"""The chat's input limits (ROADMAP 4.1, ADR-0004 layer 1): every limit, its code and status.

Each test gets a fresh app, so counters never leak between tests. Every refused request must cost
nothing: no retrieval, no model call (`chat.retriever.questions`, `chat.model.received`).
"""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from pydantic import SecretStr

from site_api.core.config import Settings
from site_api.core.errors import ApiError
from site_api.rag.retrieval import RetrievedChunk
from site_api.services import limits as limits_module
from site_api.services.limits import ChatLimits, DailySpend, client_key

from .chat_fakes import FakeRetriever
from .conftest import UNREACHABLE_DATABASE_URL, Chat, IsolatedSettings, body, events_of

PER_MINUTE = 3
PER_DAY = 5
SESSION_QUESTIONS = 2
# The address the test client (httpx's ASGI transport) reports for every request.
TEST_CLIENT_IP = "127.0.0.1"


@pytest.fixture
def settings() -> Settings:
    """Small limits, so a test reaches each one in a few requests."""
    return IsolatedSettings(
        app_env="test",
        database_url=SecretStr(UNREACHABLE_DATABASE_URL),
        db_connect_timeout_s=1,
        chat_requests_per_minute_per_ip=PER_MINUTE,
        chat_requests_per_day_per_ip=PER_DAY,
        session_max_questions=SESSION_QUESTIONS,
        chat_streams_per_ip=1,
        daily_budget_usd=0.01,
    )


@pytest.fixture
def limits(app: FastAPI) -> ChatLimits:
    """The app's own limits."""
    app_limits: ChatLimits = app.state.chat_limits
    return app_limits


def assert_refused(response: Response, status: int, code: str) -> None:
    """A JSON error before any stream, with a retry hint (SPEC §4.3)."""
    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
    error = response.json()["error"]
    assert error["code"] == code
    assert error["retry_after_s"] >= 1
    # 429 and 503 also tell the client in the standard header.
    assert int(response.headers["retry-after"]) == error["retry_after_s"]


# ── Per IP: the real enforcement ──────────────────────────────────────────────────────────────


async def test_requests_over_the_per_minute_limit_are_429_rate_limited(
    client: AsyncClient, chat: Chat
) -> None:
    for _ in range(PER_MINUTE):
        # A new session each time: only the IP limit can be hit here.
        assert (await client.post("/api/chat", json=body())).status_code == 200

    response = await client.post("/api/chat", json=body())

    assert_refused(response, 429, "rate_limited")
    assert response.json()["error"]["retry_after_s"] <= 60
    assert len(chat.retriever.questions) == PER_MINUTE


async def test_the_per_day_limit_holds_beyond_the_minute_limit(
    settings: Settings, chat: Chat
) -> None:
    roomy_minute = settings.model_copy(update={"chat_requests_per_minute_per_ip": 100})
    limits = ChatLimits(roomy_minute, chat.spend)
    for _ in range(PER_DAY):
        await limits.check_ip("203.0.113.7")

    with pytest.raises(ApiError) as refused:
        await limits.check_ip("203.0.113.7")

    assert refused.value.code == "rate_limited"
    assert refused.value.status_code == 429
    # The day's window, not the minute's: the wait is longer than a minute.
    assert refused.value.retry_after_s is not None
    assert refused.value.retry_after_s > 60


@pytest.mark.usefixtures("chat")
async def test_the_ip_limit_counts_invalid_requests_too(client: AsyncClient) -> None:
    # The IP check runs before the body is read: a flood of junk is limited like real questions.
    for _ in range(PER_MINUTE):
        assert (await client.post("/api/chat", json={"junk": True})).status_code == 422

    response = await client.post("/api/chat", json={"junk": True})

    assert_refused(response, 429, "rate_limited")


async def test_one_ips_limit_never_blocks_another_ip(limits: ChatLimits) -> None:
    for _ in range(PER_MINUTE):
        await limits.check_ip("203.0.113.7")

    await limits.check_ip("198.51.100.4")


# ── Per session: a UX nicety ──────────────────────────────────────────────────────────────────


async def test_questions_over_the_session_limit_are_429_session_limit(
    client: AsyncClient, chat: Chat
) -> None:
    same_session = body()
    for _ in range(SESSION_QUESTIONS):
        assert (await client.post("/api/chat", json=same_session)).status_code == 200

    response = await client.post("/api/chat", json=same_session)

    assert_refused(response, 429, "session_limit")
    assert len(chat.retriever.questions) == SESSION_QUESTIONS


async def test_a_too_long_question_uses_up_no_session_question(
    client: AsyncClient, chat: Chat
) -> None:
    too_long = body("a" * (chat.settings.max_question_chars + 1))
    for _ in range(SESSION_QUESTIONS):
        assert (await client.post("/api/chat", json=too_long)).status_code == 413

    # Same session, now a valid question: it still has all its questions.
    response = await client.post("/api/chat", json={**too_long, "message": "Hi"})

    assert response.status_code == 200


# ── The daily budget ──────────────────────────────────────────────────────────────────────────


async def test_a_spent_daily_budget_is_503_budget_exceeded_for_everyone(
    client: AsyncClient, chat: Chat
) -> None:
    chat.spend.add(0.01)

    response = await client.post("/api/chat", json=body())

    assert_refused(response, 503, "budget_exceeded")
    # Until the next midnight UTC: at most a day away.
    assert response.json()["error"]["retry_after_s"] <= 24 * 60 * 60
    assert chat.retriever.questions == []
    assert chat.model.received == []


async def test_every_answer_adds_its_estimated_cost_to_the_day(
    client: AsyncClient, chat: Chat
) -> None:
    response = await client.post("/api/chat", json=body())

    (usage,) = [event for event in events_of(response) if event["type"] == "usage"]
    assert chat.spend.spent_usd == pytest.approx(usage["estimated_cost_usd"])


async def test_a_request_refused_for_the_budget_uses_up_no_session_question(
    client: AsyncClient, chat: Chat, monkeypatch: pytest.MonkeyPatch
) -> None:
    same_session = body()
    monkeypatch.setattr(chat.spend, "exceeded", lambda: True)
    for _ in range(SESSION_QUESTIONS):
        assert (await client.post("/api/chat", json=same_session)).status_code == 503

    monkeypatch.undo()  # the budget allows answers again (a new day)

    assert (await client.post("/api/chat", json=same_session)).status_code == 200


# ── Answers streaming at once ─────────────────────────────────────────────────────────────────


class SlotWatchingRetriever(FakeRetriever):
    """Records how many streams the test client's IP holds while its answer is in progress."""

    def __init__(self, limits: ChatLimits) -> None:
        super().__init__(chunks=[])
        self.limits: ChatLimits = limits
        self.active_while_answering: list[int] = []

    async def retrieve(self, question: str) -> list[RetrievedChunk]:
        self.active_while_answering.append(self.limits.active_streams(TEST_CLIENT_IP))
        return await super().retrieve(question)


async def test_a_second_stream_from_one_ip_is_429_until_the_first_ends(
    client: AsyncClient, chat: Chat, limits: ChatLimits
) -> None:
    watcher = SlotWatchingRetriever(limits)
    chat.retriever = watcher
    limits.open_stream(TEST_CLIENT_IP)  # another answer to this IP is still streaming

    refused = await client.post("/api/chat", json=body())

    assert_refused(refused, 429, "rate_limited")
    limits.close_stream(TEST_CLIENT_IP)  # that answer has ended

    accepted = await client.post("/api/chat", json=body())

    assert accepted.status_code == 200
    assert watcher.active_while_answering == [1], "the slot is held while the answer streams"
    assert limits.active_streams(TEST_CLIENT_IP) == 0, "and given back when the stream ends"


async def test_a_refused_second_stream_uses_up_no_session_question(
    client: AsyncClient, chat: Chat, limits: ChatLimits
) -> None:
    same_session = body()
    limits.open_stream(TEST_CLIENT_IP)
    for _ in range(SESSION_QUESTIONS):
        assert (await client.post("/api/chat", json=same_session)).status_code == 429
    limits.close_stream(TEST_CLIENT_IP)

    # The IP window allows one more request; the session still has all its questions.
    assert (await client.post("/api/chat", json=same_session)).status_code == 200
    assert len(chat.retriever.questions) == 1


# ── The visitor's key ─────────────────────────────────────────────────────────────────────────


def test_an_ipv4_address_is_its_own_key() -> None:
    assert client_key("203.0.113.7") == "203.0.113.7"


def test_addresses_of_one_ipv6_64_block_share_one_key() -> None:
    # One customer's block: picking a new address per request must not get past the limits.
    first = client_key("2001:db8:1:2::1")
    second = client_key("2001:db8:1:2:ffff:ffff:ffff:ffff")

    assert first == second == "2001:db8:1:2::/64"
    assert client_key("2001:db8:1:3::1") != first


def test_a_peer_that_is_not_an_address_keeps_its_name() -> None:
    assert client_key("unknown") == "unknown"


# ── The day ───────────────────────────────────────────────────────────────────────────────────


def test_the_daily_spend_starts_from_zero_on_a_new_utc_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(limits_module, "_today", lambda: "2026-11-05")
    spend = DailySpend(1.0)
    spend.add(1.0)
    assert spend.exceeded()

    monkeypatch.setattr(limits_module, "_today", lambda: "2026-11-06")

    assert spend.spent_usd == 0
    assert not spend.exceeded()


def test_the_budget_retry_is_never_more_than_a_day() -> None:
    assert 1 <= limits_module.seconds_until_tomorrow() <= 24 * 60 * 60
