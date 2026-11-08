"""The router in the chat stream (ROADMAP 4.2, SPEC §4.1, §5.1, ADR-0004 layer 2).

Only `about_ivan` reaches retrieval and the answer model. The other classes get a localized
template: route → token → usage → done(`templated`). A failed router fails closed.
"""

from typing import cast

import httpx2
import openai
import pytest
from httpx import AsyncClient
from openai.types.chat import ChatCompletion

from site_api.prompts.localized import RouteTemplate, template_answer

from .chat_fakes import FakeRouterModel, routing
from .conftest import Chat, body, events_of

TEMPLATED: tuple[RouteTemplate, ...] = ("greeting", "off_topic", "injection", "rude")
OPENAI_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
# A completion the SDK reports as cut off (only its identity matters to the error).
COMPLETION = ChatCompletion.model_construct(
    id="test", choices=[], created=0, model="gpt-6-luna", object="chat.completion"
)


async def ask(
    client: AsyncClient, message: str = "Hi!", **extra: object
) -> list[dict[str, object]]:
    response = await client.post("/api/chat", json=body(message, **extra))
    assert response.status_code == 200
    return events_of(response)


@pytest.mark.parametrize("route", TEMPLATED)
async def test_a_templated_class_streams_route_token_usage_done(
    client: AsyncClient, chat: Chat, route: RouteTemplate
) -> None:
    chat.router = routing(route, "en")

    events = await ask(client)

    assert [event["type"] for event in events] == ["route", "token", "usage", "done"]
    assert events[0] == {"type": "route", "route": route, "language": "en"}
    assert events[1]["text"] == template_answer(route, "en")
    assert events[-1]["finish_reason"] == "templated"


@pytest.mark.parametrize("route", TEMPLATED)
async def test_a_templated_answer_calls_neither_retrieval_nor_the_answer_model(
    client: AsyncClient, chat: Chat, route: RouteTemplate
) -> None:
    chat.router = routing(route, "en")

    events = await ask(client)

    assert chat.retriever.questions == []
    assert chat.model.received == []
    (usage,) = [event for event in events if event["type"] == "usage"]
    # Only the router ran: its tokens are the whole cost (ADR-0004: ~$0.00005 a question).
    nodes = cast("list[dict[str, object]]", usage["nodes"])
    assert [node["name"] for node in nodes] == ["router"]
    assert usage["estimated_cost_usd"] == pytest.approx(0.000046)
    assert chat.spend.spent_usd == pytest.approx(0.000046)


@pytest.mark.parametrize("language", ["es", "ru", "uk"])
async def test_the_template_comes_in_the_questions_language(
    client: AsyncClient, chat: Chat, language: str
) -> None:
    chat.router = routing("greeting", language)

    events = await ask(client)

    assert events[0]["language"] == language
    assert events[1]["text"] == template_answer("greeting", language)
    assert events[1]["text"] != template_answer("greeting", "en")


async def test_a_language_without_templates_gets_english(client: AsyncClient, chat: Chat) -> None:
    chat.router = routing("off_topic", "de")

    events = await ask(client, "Gib mir ein Rezept für Pfannkuchen")

    # The route event still says what the question was written in.
    assert events[0]["language"] == "de"
    assert events[1]["text"] == template_answer("off_topic", "en")


async def test_an_about_ivan_question_carries_its_language_into_the_route_event(
    client: AsyncClient, chat: Chat
) -> None:
    chat.router = routing("about_ivan", "es")

    events = await ask(client, "¿Qué tecnologías usa Iván?")

    assert events[0] == {"type": "route", "route": "about_ivan", "language": "es"}
    assert events[1]["type"] == "sources"
    assert chat.retriever.questions == ["¿Qué tecnologías usa Iván?"]


async def test_unparsable_router_output_fails_closed_without_an_answer(
    client: AsyncClient, chat: Chat
) -> None:
    # ADR-0004: no class, no answer. Never a free-form answer from a guessed class.
    chat.router = FakeRouterModel(decision=None)

    events = await ask(client)

    assert [event["type"] for event in events] == ["error"]
    assert events[0]["code"] == "upstream_unavailable"
    assert chat.retriever.questions == []
    assert chat.model.received == []


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (openai.APITimeoutError(request=OPENAI_REQUEST), "timeout"),
        (openai.APIConnectionError(request=OPENAI_REQUEST), "upstream_unavailable"),
    ],
    ids=["router-timeout", "router-down"],
)
async def test_a_router_failure_ends_the_stream_with_its_error(
    client: AsyncClient, chat: Chat, error: Exception, code: str
) -> None:
    chat.router = FakeRouterModel(error=error)

    events = await ask(client)

    assert events == [
        {
            "type": "error",
            "code": code,
            "message": events[0]["message"],
            "retry_after_s": None,
        }
    ]
    assert chat.model.received == []


async def test_the_router_sees_the_question_and_only_the_last_turns(
    client: AsyncClient, chat: Chat
) -> None:
    history = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"turn {index}"}
        for index in range(6)
    ]

    await ask(client, "And his skills?", history=history)

    (messages,) = chat.router.received
    data = messages[-1].content
    assert isinstance(data, str)
    turns = chat.settings.router_history_turns
    # Only the last turns go in as context; the question is the latest message.
    for index, turn in enumerate(history):
        assert (turn["content"] in data) == (index >= len(history) - turns)
    assert data.endswith("<latest_message>\nAnd his skills?\n</latest_message>")


async def test_unparsable_router_output_still_counts_its_tokens_toward_the_budget(
    client: AsyncClient, chat: Chat
) -> None:
    chat.router = FakeRouterModel(decision=None)

    await ask(client)

    # The provider billed the call even though its output was unusable.
    assert chat.spend.spent_usd == pytest.approx(0.000046)


async def test_a_router_answer_cut_off_by_openai_fails_closed_as_unavailable(
    client: AsyncClient, chat: Chat
) -> None:
    # OpenAI's SDK raises this itself when structured output hits the token cap: a refusal of
    # sorts, not our bug (`internal` would log it as one).
    chat.router = FakeRouterModel(error=openai.LengthFinishReasonError(completion=COMPLETION))

    events = await ask(client)

    assert [event["code"] for event in events] == ["upstream_unavailable"]


async def test_a_stalled_router_ends_with_timeout_at_the_deadline(
    client: AsyncClient, chat: Chat
) -> None:
    chat.settings = chat.settings.model_copy(update={"chat_total_timeout_s": 0.05})
    chat.router = FakeRouterModel(hang=True)

    events = await ask(client)

    assert [event["code"] for event in events] == ["timeout"]
    assert chat.retriever.questions == []
