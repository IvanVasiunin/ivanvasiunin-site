"""Contract of `POST /api/chat` (SPEC §4.1-4.3): every event type, the event order, the errors.

The pipeline runs for real; only its edges are fakes: a retriever with fixed chunks and a model
with a scripted stream (`chat_fakes.py`). No network, no database.
"""

import json
import logging
import uuid
from collections.abc import Iterator
from typing import cast

import httpx2
import openai
import pytest
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError

from site_api.core.openapi import contract_schemas
from site_api.schemas.chat import CHAT_EVENT_ADAPTER

from .chat_fakes import FakeRetriever, answering, routing
from .conftest import QUESTION, Chat, body, events_of

# A marker that must never appear in a log line (fastapi.md, privacy).
MARKER_QUESTION = "marker-7f3a: what is Ivan's home address?"
INTERNAL_DETAIL = "pool exhausted at db-internal-host:5432"
# The provider SDKs build their errors around `httpx2` requests.
OPENAI_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")


async def ask(
    client: AsyncClient, message: str = QUESTION, **extra: object
) -> list[dict[str, object]]:
    response = await client.post("/api/chat", json=body(message, **extra))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    return events_of(response)


def of_type(events: list[dict[str, object]], kind: str) -> list[dict[str, object]]:
    return [event for event in events if event["type"] == kind]


# ── Order and shape ───────────────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("chat")
async def test_an_answer_streams_route_sources_tokens_usage_done_in_order(
    client: AsyncClient,
) -> None:
    events = await ask(client)

    assert [event["type"] for event in events] == [
        "route",
        "sources",
        "token",
        "token",
        "usage",
        "done",
    ]


@pytest.mark.usefixtures("chat")
async def test_every_event_on_the_wire_matches_the_contract(client: AsyncClient) -> None:
    events = await ask(client)

    for event in events:
        # Round trip: the wire JSON validates and serialises back to itself, every key included.
        parsed = CHAT_EVENT_ADAPTER.validate_python(event)
        assert CHAT_EVENT_ADAPTER.dump_python(parsed, mode="json") == event


# ── One test per event type ───────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("chat")
async def test_the_route_event_is_about_ivan_in_english_until_the_router_exists(
    client: AsyncClient,
) -> None:
    events = await ask(client)

    assert events[0] == {"type": "route", "route": "about_ivan", "language": "en"}


async def test_the_sources_event_lists_the_retrieved_chunks_best_first(
    client: AsyncClient, chat: Chat
) -> None:
    events = await ask(client)

    assert chat.retriever.questions == [QUESTION]
    (sources,) = of_type(events, "sources")
    assert sources["items"] == [
        {
            "chunk_id": "cv:brainrocket:0",
            "score": 0.83,
            "source_type": "cv",
            "title": "CV — BrainRocket",
            "section": "BrainRocket",
            "url": "/cv#brainrocket",
            # On one line: the chunk's line break is gone.
            "snippet": "Builds and reviews UI for iGaming platforms.",
        },
        {
            "chunk_id": "experience:skills:1",
            "score": 0.5,
            "source_type": "experience",
            "title": "Experience notes — Skills",
            "section": "Skills",
            "url": None,
            "snippet": "HTML, SCSS, TypeScript, React.",
        },
    ]


async def test_without_any_chunk_the_answer_is_the_no_information_template(
    client: AsyncClient, chat: Chat
) -> None:
    chat.retriever = FakeRetriever(chunks=[])

    events = await ask(client)

    # SPEC §4.2: an empty `sources` list, then the templated "no information" answer.
    assert [event["type"] for event in events] == ["route", "sources", "token", "usage", "done"]
    assert of_type(events, "sources") == [{"type": "sources", "items": []}]
    assert events[-1]["finish_reason"] == "no_info"
    assert chat.model.received == []


@pytest.mark.usefixtures("chat")
async def test_token_events_carry_the_answer_text_in_order(client: AsyncClient) -> None:
    events = await ask(client)

    assert [event["text"] for event in of_type(events, "token")] == ["Ivan ", "builds UI."]


async def test_the_usage_event_reports_every_step_its_tokens_and_the_cost(
    client: AsyncClient, chat: Chat
) -> None:
    events = await ask(client)

    (usage,) = of_type(events, "usage")
    router, retrieval, gate, generate = cast("list[dict[str, object]]", usage["nodes"])
    # The steps of SPEC §4.2's example, in order (the input guard runs before the stream).
    assert [router["name"], retrieval["name"], gate["name"], generate["name"]] == [
        "router",
        "retrieval",
        "relevance_gate",
        "generate",
    ]
    # The models' names, never their configuration (SPEC US-A9).
    assert router["model"] == chat.settings.router_model
    assert generate["model"] == chat.settings.answer_model
    assert (router["input_tokens"], router["output_tokens"]) == (400, 12)
    assert (
        generate["input_tokens"],
        generate["cached_input_tokens"],
        generate["output_tokens"],
    ) == (1200, 1000, 40)
    # gpt-6-luna: 400 in * $0.10 + 12 out * $0.50 = $0.000046; gpt-6.1-terra: 200 fresh * $1 +
    # 1000 cached * $0.05 + 40 out * $5 = $0.00045 (per 1M tokens).
    assert usage["estimated_cost_usd"] == pytest.approx(0.000046 + 0.00045)
    assert isinstance(usage["total_ms"], int)


@pytest.mark.usefixtures("chat")
async def test_the_done_event_has_a_new_message_id_for_every_answer(client: AsyncClient) -> None:
    first = (await ask(client))[-1]
    second = (await ask(client))[-1]

    assert first["type"] == second["type"] == "done"
    assert first["finish_reason"] == "stop"
    assert uuid.UUID(str(first["message_id"])).version == 4
    assert first["message_id"] != second["message_id"]


async def test_an_answer_cut_by_the_token_limit_is_done_with_length(
    client: AsyncClient, chat: Chat
) -> None:
    chat.model = answering("Ivan builds", finish_reason="length")

    events = await ask(client)

    assert events[-1]["finish_reason"] == "length"


# ── Errors inside the stream ──────────────────────────────────────────────────────────────────


async def test_a_provider_timeout_mid_answer_ends_the_stream_with_a_timeout_error(
    client: AsyncClient, chat: Chat
) -> None:
    chat.model = answering("Ivan ", error=openai.APITimeoutError(request=OPENAI_REQUEST))

    events = await ask(client)

    assert [event["type"] for event in events] == ["route", "sources", "token", "error"]
    assert events[-1] == {
        "type": "error",
        "code": "timeout",
        "message": "The answer took too long. Please try again.",
        "retry_after_s": None,
    }


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (openai.APIConnectionError(request=OPENAI_REQUEST), "upstream_unavailable"),
        (OperationalError("SELECT", None, ConnectionRefusedError()), "upstream_unavailable"),
        (RuntimeError(INTERNAL_DETAIL), "internal"),
    ],
    ids=["provider-down", "database-down", "our-bug"],
)
async def test_a_failed_retrieval_ends_the_stream_with_one_error_and_no_done(
    client: AsyncClient, chat: Chat, error: Exception, code: str
) -> None:
    chat.retriever = FakeRetriever(error=error)

    events = await ask(client)

    assert [event["type"] for event in events] == ["route", "error"]
    assert events[-1]["code"] == code
    # A safe message only: nothing of the exception reaches the visitor.
    assert INTERNAL_DETAIL not in json.dumps(events)


# ── Errors before the stream (JSON, SPEC §4.3) ────────────────────────────────────────────────


async def test_a_question_over_the_limit_is_413_input_too_long_before_any_event(
    client: AsyncClient, chat: Chat
) -> None:
    limit = chat.settings.max_question_chars

    response = await client.post("/api/chat", json=body("a" * (limit + 1)))

    assert response.status_code == 413
    assert response.headers["content-type"] == "application/json"
    assert response.json()["error"]["code"] == "input_too_long"
    assert chat.retriever.questions == []


async def test_the_limit_counts_the_trimmed_question(client: AsyncClient, chat: Chat) -> None:
    limit = chat.settings.max_question_chars

    events = await ask(client, "  " + "a" * limit + "  ")

    assert events[-1]["type"] == "done"


@pytest.mark.usefixtures("chat")
@pytest.mark.parametrize(
    "payload",
    [
        {"message": "   ", "session_id": str(uuid.uuid4())},
        {"message": QUESTION, "session_id": "not-a-uuid"},
        {"message": QUESTION, "session_id": str(uuid.uuid4()), "history": [{"role": "system"}]},
    ],
    ids=["blank-question", "bad-session", "bad-history"],
)
async def test_an_invalid_request_is_422_invalid_request(
    client: AsyncClient, payload: dict[str, object]
) -> None:
    response = await client.post("/api/chat", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


async def test_without_model_keys_chat_is_503_upstream_unavailable(
    client: AsyncClient, app: FastAPI
) -> None:
    # What the lifespan sets when a key is missing (create_chat_service).
    app.state.chat_service = None

    response = await client.post("/api/chat", json=body())

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_unavailable"


# ── History, privacy, schema ──────────────────────────────────────────────────────────────────


async def test_only_the_last_history_turns_reach_the_model(client: AsyncClient, chat: Chat) -> None:
    limit = chat.settings.history_max_turns
    history = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"turn {index}"}
        for index in range(limit + 4)
    ]

    await ask(client, history=history)

    (messages,) = chat.model.received
    # System prompt, the last `limit` turns, the question.
    assert [message.content for message in messages[1:-1]] == [
        turn["content"] for turn in history[-limit:]
    ]


async def test_retrieval_searches_with_the_routers_query_and_the_model_reads_the_question(
    client: AsyncClient, chat: Chat
) -> None:
    # SPEC §5.1 (2026-11-08): the English search query finds the chunks; the answer model still
    # answers the visitor's own words, in their language.
    chat.router = routing("about_ivan", "uk", ["Ivan's current job at BrainRocket"])

    await ask(client, "що Іван робить на роботі?")

    assert chat.retriever.questions == ["Ivan's current job at BrainRocket"]
    (messages,) = chat.model.received
    assert "що Іван робить на роботі?" in str(messages[-1].content)


async def test_a_job_description_is_searched_requirement_by_requirement(
    client: AsyncClient, chat: Chat
) -> None:
    # SPEC §5.7: one query per requirement, so each one finds its own sources.
    queries = ["Ivan's education", "Ivan's experience with Jest and Playwright"]
    chat.router = routing("about_ivan", "en", queries)

    await ask(client, "Requirements: a degree in Computer Engineering; Jest or Playwright.")

    assert chat.retriever.questions == queries


async def test_without_a_search_query_retrieval_searches_with_the_question(
    client: AsyncClient, chat: Chat
) -> None:
    chat.router = routing("about_ivan", "en", [])

    await ask(client)

    assert chat.retriever.questions == [QUESTION]


@pytest.fixture
def captured_logs(caplog: pytest.LogCaptureFixture) -> Iterator[pytest.LogCaptureFixture]:
    with caplog.at_level(logging.DEBUG):
        yield caplog


async def test_the_question_never_reaches_the_log(
    client: AsyncClient, chat: Chat, captured_logs: pytest.LogCaptureFixture
) -> None:
    # The failing path logs the most (stack and all): the question is in the exception message.
    chat.retriever = FakeRetriever(error=RuntimeError(MARKER_QUESTION))

    await ask(client, MARKER_QUESTION)

    assert captured_logs.records, "the failure should be logged"
    for record in captured_logs.records:
        assert "marker-7f3a" not in record.getMessage()
        assert "marker-7f3a" not in json.dumps(record.__dict__, default=str)


async def test_the_history_never_reaches_the_log_or_the_error_event(
    client: AsyncClient, chat: Chat, captured_logs: pytest.LogCaptureFixture
) -> None:
    # The model fails mid-answer with the history in its message, as a provider error might.
    history_text = "marker-9c1e: an earlier question"
    chat.model = answering("Ivan ", error=RuntimeError(history_text))

    events = await ask(client, history=[{"role": "user", "content": history_text}])

    assert events[-1]["code"] == "internal"
    assert "marker-9c1e" not in json.dumps(events)
    for record in captured_logs.records:
        assert "marker-9c1e" not in json.dumps(record.__dict__, default=str)


async def test_a_long_history_turn_reaches_the_model_cut(client: AsyncClient, chat: Chat) -> None:
    limit = chat.settings.history_turn_max_chars

    await ask(client, history=[{"role": "assistant", "content": "x" * (limit + 500)}])

    (messages,) = chat.model.received
    assert messages[1].content == "x" * (limit - 1) + "…"


async def test_the_openapi_event_schemas_equal_the_registered_contract(app: FastAPI) -> None:
    # FastAPI now documents the stream's events itself; the explicit registration
    # (core/openapi.py) must never hide a difference between the two.
    generated = get_openapi(title="t", version="1", routes=app.routes)["components"]["schemas"]
    registered = contract_schemas()

    shared = registered.keys() & generated.keys()
    assert {"RouteEvent", "SourcesEvent", "TokenEvent", "UsageEvent", "DoneEvent"} <= shared
    for name in shared:
        # One known difference: FastAPI leaves `"default": null` out of output schemas. It is an
        # annotation, not a constraint: types, limits and `required` are compared in full.
        assert without_defaults(generated[name]) == without_defaults(registered[name]), name


def without_defaults(schema: object) -> object:
    """The JSON schema with every `default` annotation removed, at any depth."""
    if isinstance(schema, dict):
        items = cast("dict[str, object]", schema).items()
        return {key: without_defaults(value) for key, value in items if key != "default"}
    if isinstance(schema, list):
        return [without_defaults(value) for value in cast("list[object]", schema)]
    return schema
