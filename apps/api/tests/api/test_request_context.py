"""Request IDs, the access log line, and the last-resort 500 (core/request_context.py)."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from httpx import ASGITransport, AsyncClient
from starlette.requests import ClientDisconnect
from starlette.types import Message, Receive, Scope, Send

from site_api.core.logging import JsonFormatter, request_id_var
from site_api.core.request_context import (
    CLIENT_CLOSED_REQUEST,
    RequestContextMiddleware,
    incoming_request_id,
)

from .conftest import INTERNAL_DETAIL, add_crash_route

QUESTION = "what-is-the-secret"
route_logger = logging.getLogger("site_api.test_route")


@pytest.fixture(autouse=True)
def register_test_routes(app: FastAPI) -> None:
    add_crash_route(app)

    @app.get("/api/test/log")
    async def log_line() -> None:
        route_logger.info("inside the route")
        await asyncio.sleep(0.01)  # let concurrent requests interleave

    @app.get("/api/test/stream-crash")
    async def stream_crash() -> StreamingResponse:
        async def chunks() -> AsyncIterator[str]:
            yield "first chunk"
            raise RuntimeError(INTERNAL_DETAIL)

        return StreamingResponse(chunks(), media_type="text/plain")


def _access_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "site_api.access"]


async def test_every_response_gets_a_request_id(client: AsyncClient) -> None:
    first = await client.get("/api/health")
    second = await client.get("/api/health")

    assert len(first.headers["x-request-id"]) == 32
    assert first.headers["x-request-id"] != second.headers["x-request-id"]


async def test_a_plain_incoming_request_id_is_reused(client: AsyncClient) -> None:
    response = await client.get("/api/health", headers={"X-Request-ID": "trace-0001-abcd"})

    assert response.headers["x-request-id"] == "trace-0001-abcd"


@pytest.mark.parametrize("unsafe", ["short", "has spaces in it", "x" * 65, "line\nbreak-1234"])
def test_an_unsafe_incoming_request_id_is_rejected(unsafe: str) -> None:
    # Checked on a raw ASGI scope: an HTTP client might refuse to send some of these values at all.
    scope: Scope = {"type": "http", "headers": [(b"x-request-id", unsafe.encode("latin-1"))]}

    assert incoming_request_id(scope) is None


class _JsonLines(logging.Handler):
    """Formats each record when it is emitted, inside the request, as the server would."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: list[dict[str, object]] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(json.loads(JsonFormatter().format(record)))


@pytest.fixture
def route_json_lines() -> Iterator[_JsonLines]:
    handler = _JsonLines()
    route_logger.addHandler(handler)
    route_logger.setLevel(logging.INFO)
    yield handler
    route_logger.removeHandler(handler)


async def test_log_lines_carry_their_own_request_id_under_concurrency(
    client: AsyncClient, route_json_lines: _JsonLines
) -> None:
    ids = [f"req-{n:08d}" for n in range(5)]

    await asyncio.gather(
        *(client.get("/api/test/log", headers={"X-Request-ID": request_id}) for request_id in ids)
    )

    assert sorted(str(line["request_id"]) for line in route_json_lines.lines) == ids
    # After the requests, no request ID leaks into unrelated log lines.
    assert request_id_var.get() is None


async def test_the_access_line_has_route_and_timing_but_no_ip_or_query(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="site_api.access"):
        response = await client.get(f"/api/health?q={QUESTION}")

    [record] = _access_records(caplog)
    assert getattr(record, "method", None) == "GET"
    assert getattr(record, "route", None) == "/api/health"
    assert getattr(record, "status_code", None) == response.status_code
    assert isinstance(getattr(record, "duration_ms", None), float)
    everything = record.getMessage() + str(record.__dict__)
    assert QUESTION not in everything
    # httpx's test transport reports the client as 127.0.0.1.
    assert "127.0.0.1" not in everything


async def test_an_unknown_path_is_logged_as_unmatched(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="site_api.access"):
        await client.get(f"/api/{QUESTION}")

    [record] = _access_records(caplog)
    assert getattr(record, "route", None) == "unmatched"
    assert QUESTION not in str(record.__dict__)


async def test_a_crash_becomes_a_clean_500_with_a_request_id_logged_once(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO):
        response = await client.get("/api/test/crash")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal"
    assert INTERNAL_DETAIL not in response.text
    assert "x-request-id" in response.headers

    errors = [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert len(errors) == 1
    assert getattr(errors[0], "error_type", None) == "RuntimeError"
    assert INTERNAL_DETAIL not in errors[0].getMessage() + str(errors[0].__dict__)
    [access] = _access_records(caplog)
    assert getattr(access, "status_code", None) == 500
    assert getattr(access, "error_code", None) == "internal"


async def test_a_crash_after_a_stream_started_is_logged_once_and_left_to_the_server(
    app: FastAPI, caplog: pytest.LogCaptureFixture
) -> None:
    # raise_app_exceptions=True: the exception must reach the server, which closes the connection.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with caplog.at_level(logging.INFO), pytest.raises(RuntimeError):
            await client.get("/api/test/stream-crash")

    errors = [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert len(errors) == 1
    [access] = _access_records(caplog)
    # The stream had already started with 200; the access line marks it as failed.
    assert getattr(access, "status_code", None) == 200
    assert getattr(access, "error_code", None) == "internal"


async def _receive_disconnect() -> Message:
    return {"type": "http.disconnect"}


async def _send_nothing(_message: Message) -> None:
    return None


_SCOPE: Scope = {"type": "http", "method": "POST", "path": "/api/chat", "headers": []}


async def test_a_client_that_went_away_is_499_not_an_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Called directly: with nobody left to answer, there is no response for a test client to read.
    async def disconnected_app(_scope: Scope, _receive: Receive, _send: Send) -> None:
        raise ClientDisconnect

    middleware = RequestContextMiddleware(disconnected_app)
    with caplog.at_level(logging.INFO):
        await middleware(_SCOPE, _receive_disconnect, _send_nothing)

    assert not [record for record in caplog.records if record.levelno >= logging.ERROR]
    [access] = _access_records(caplog)
    assert getattr(access, "status_code", None) == CLIENT_CLOSED_REQUEST


async def test_a_cancelled_request_is_499_and_the_cancellation_propagates(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def cancelled_app(_scope: Scope, _receive: Receive, _send: Send) -> None:
        raise asyncio.CancelledError

    middleware = RequestContextMiddleware(cancelled_app)
    with caplog.at_level(logging.INFO), pytest.raises(asyncio.CancelledError):
        await middleware(_SCOPE, _receive_disconnect, _send_nothing)

    [access] = _access_records(caplog)
    assert getattr(access, "status_code", None) == CLIENT_CLOSED_REQUEST
    assert not [record for record in caplog.records if record.levelno >= logging.ERROR]
