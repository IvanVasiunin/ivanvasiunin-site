"""`POST /api/chat` (SPEC §4.1): the answer as Server-Sent Events, a thin layer over the service.

Checks that need an HTTP status run in dependencies, before the stream starts: once the first
event is sent, the status is 200 and errors can only travel as `error` events (SPEC §4.3). The
input guard (ADR-0004 layer 1) runs in this order, and none of it calls a model:

1. requests per IP (`limit_by_ip`); it runs before the body is validated, so requests with a
   wrong shape count too (unparsable JSON is refused earlier, by FastAPI, and Caddy caps the body);
2. the question's length and the day's budget (`checked_request`): they use up no quota;
3. whether chat is configured (`get_chat_service`);
4. answers streaming at once per IP (`stream_slot`), held until the stream ends;
5. questions per session (`session_checked`), last, so a request refused by any check above
   uses up none of the session's questions.
"""

from collections.abc import AsyncIterable, AsyncIterator
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.sse import EventSourceResponse

from site_api.deps import client_ip, get_chat_limits, get_chat_service
from site_api.schemas.chat import ChatEvent, ChatRequest
from site_api.schemas.errors import ErrorResponse
from site_api.services.chat import ChatService
from site_api.services.limits import ChatLimits

router: APIRouter = APIRouter(prefix="/api", tags=["chat"])

type Limits = Annotated[ChatLimits, Depends(get_chat_limits)]


async def limit_by_ip(request: Request, limits: Limits) -> None:
    """Count the request against its IP's per-minute and per-day limits."""
    await limits.check_ip(client_ip(request))


def checked_request(body: ChatRequest, limits: Limits) -> ChatRequest:
    """The request, if its question fits the length limit and today's budget allows an answer."""
    limits.check_question_length(body.message)
    limits.check_budget()
    return body


async def stream_slot(
    request: Request,
    # Listed so they run first: a slot is taken only for a request that will really stream.
    _body: Annotated[ChatRequest, Depends(checked_request)],
    _service: Annotated[ChatService, Depends(get_chat_service)],
    limits: Limits,
) -> AsyncIterator[None]:
    """Hold one of the IP's stream slots for as long as the answer streams."""
    ip = client_ip(request)
    limits.open_stream(ip)
    try:
        # FastAPI runs the code after `yield` once the response has been sent, so the slot is
        # free again when the stream ends, whether it finished, failed or the visitor left.
        yield
    finally:
        limits.close_stream(ip)


async def session_checked(
    body: Annotated[ChatRequest, Depends(checked_request)],
    _slot: Annotated[None, Depends(stream_slot)],
    limits: Limits,
) -> ChatRequest:
    """The request, if its session may ask one more question (counted only now, after the rest)."""
    await limits.check_session(str(body.session_id))
    return body


def _json_error(description: str) -> dict[str, object]:
    """An error response documented as JSON.

    With `response_class=EventSourceResponse`, FastAPI documents every response of the route,
    errors included, as `text/event-stream`; errors before the stream are JSON (SPEC §4.3).
    """
    schema_ref = f"#/components/schemas/{ErrorResponse.__name__}"
    return {
        "description": description,
        "content": {"application/json": {"schema": {"$ref": schema_ref}}},
    }


@router.post(
    "/chat",
    response_class=EventSourceResponse,
    dependencies=[Depends(limit_by_ip)],
    responses={
        status.HTTP_413_CONTENT_TOO_LARGE: _json_error("Question too long (SPEC §4.3)"),
        status.HTTP_422_UNPROCESSABLE_CONTENT: _json_error("Invalid request (SPEC §4.3)"),
        status.HTTP_429_TOO_MANY_REQUESTS: _json_error("Rate or session limit (SPEC §4.3)"),
        status.HTTP_503_SERVICE_UNAVAILABLE: _json_error(
            "Chat unavailable or daily budget spent (SPEC §4.3)"
        ),
        "default": _json_error("Error (SPEC §4.3)"),
    },
)
async def chat(
    request: Annotated[ChatRequest, Depends(session_checked)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> AsyncIterable[ChatEvent]:
    """Stream Elio's answer: route → sources → token* → usage → done, or a terminal error."""
    # FastAPI validates each event against `ChatEvent` and writes it as one `data:` line.
    # `aclosing` closes the answer (and the provider's stream) as soon as this one ends.
    async with aclosing(service.answer(request)) as events:
        async for event in events:
            yield event
