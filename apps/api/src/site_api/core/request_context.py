"""Per-request context: request ID, access log line, and the last-resort 500.

A plain ASGI middleware rather than Starlette's `BaseHTTPMiddleware`: it does not buffer or wrap
streamed responses, which matters for the chat's SSE stream (ROADMAP 1.5+).

It sits inside the CORS middleware (see `site_api.app`), so even an unexpected 500 carries CORS
headers and the browser can read the error body instead of reporting a CORS failure.
"""

import asyncio
import logging
import re
import time
import uuid

from starlette.requests import ClientDisconnect
from starlette.routing import BaseRoute
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from site_api.core.errors import internal_error_response, log_unexpected_error
from site_api.core.logging import request_id_var

logger: logging.Logger = logging.getLogger("site_api.access")

REQUEST_ID_HEADER = "X-Request-ID"
# nginx's convention for "the client closed the connection before the response finished".
CLIENT_CLOSED_REQUEST = 499
# A client-supplied request ID is reused only if it is short and plain (letters, digits, dashes),
# so it cannot inject anything into logs or headers.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")


def incoming_request_id(scope: Scope) -> str | None:
    """The client's `X-Request-ID`, if it is safe to reuse; otherwise `None`.

    Reusing the client's ID lets a request be traced across the browser and the server. Only the
    first such header counts, and `fullmatch` checks the whole value, so a newline or any other
    character outside the pattern makes the ID rejected (a fresh one is generated instead).
    """
    for name, value in scope.get("headers", []):
        if name.decode("latin-1").lower() == REQUEST_ID_HEADER.lower():
            candidate = value.decode("latin-1")
            return candidate if _VALID_REQUEST_ID.fullmatch(candidate) else None
    return None


def route_template(scope: Scope) -> str:
    """The matched route's template (`/api/health`), never the raw path the client sent.

    The raw path is attacker-controlled and may carry data; the template is fixed and short. The
    router stores the matched route in the shared `scope` dict, so the middleware can read it.
    """
    route = scope.get("route")
    if isinstance(route, BaseRoute):
        path: str | None = getattr(route, "path", None)
        if path is not None:
            return path
    return "unmatched"


class RequestContextMiddleware:
    """Gives every HTTP request an ID, logs one access line, and turns a crash into a clean 500.

    CORS preflight requests (`OPTIONS`) are answered by the CORS middleware outside this one, so
    they have no request ID and no access line.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle one ASGI call; non-HTTP calls (lifespan) pass straight through."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = incoming_request_id(scope) or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        # What the access line reports; updated as the request goes.
        outcome: dict[str, object] = {"status_code": 500}
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            # `nonlocal`: this inner function assigns to a variable of the enclosing call.
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                outcome["status_code"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((REQUEST_ID_HEADER.encode("latin-1"), request_id.encode("latin-1")))
                # A new message instead of changing the one we were given (it is not ours).
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except ClientDisconnect:
            # The client went away while we read the request: nothing to answer, not our error.
            outcome["status_code"] = CLIENT_CLOSED_REQUEST
        except asyncio.CancelledError:
            # The server cancelled the request because the client disconnected (common for SSE).
            outcome["status_code"] = CLIENT_CLOSED_REQUEST
            raise
        except Exception as error:
            log_unexpected_error(route_template(scope), error)
            outcome["error_code"] = "internal"
            if response_started:
                # Too late for a new response (a stream already began): let the server close it.
                raise
            response = internal_error_response()
            await response(scope, receive, send_with_request_id)
        finally:
            # In `finally`, so the line is written however the request ended (success, error,
            # cancellation). No IP address and no query string: method, route template, timing.
            logger.info(
                "request",
                extra={
                    "method": scope["method"],
                    "route": route_template(scope),
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    **outcome,
                },
            )
            request_id_var.reset(token)
