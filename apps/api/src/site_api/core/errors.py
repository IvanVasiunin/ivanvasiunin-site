"""Exception handlers that turn every error into the unified error body (SPEC §4.3).

Without them FastAPI answers with its own shapes (`{"detail": ...}`), and an unexpected exception
could leak internal details. Here every path ends in `ErrorResponse`: known errors keep their code,
anything else becomes `internal` with a generic message, and the details go to the log only.
"""

import logging
import traceback
from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from site_api.schemas.errors import ErrorBody, ErrorCode, ErrorResponse

logger: logging.Logger = logging.getLogger(__name__)

_NOT_FOUND = 404
_UNPROCESSABLE = 422
_TOO_MANY_REQUESTS = 429
_SERVER_ERROR = 500
_SERVICE_UNAVAILABLE = 503
# Statuses whose responses may tell the client when to retry (RFC 9110 `Retry-After`).
_RETRYABLE_STATUSES = frozenset({_TOO_MANY_REQUESTS, _SERVICE_UNAVAILABLE})

# User-facing messages for errors raised by the framework rather than by our own code.
_MESSAGES: dict[ErrorCode, str] = {
    "invalid_request": "The request is not valid.",
    "not_found": "There is nothing at this address.",
    "rate_limited": "Too many requests in a short time. Please wait a moment.",
    "internal": "Something went wrong on our side. Please try again.",
}


class ApiError(Exception):
    """An error our own code raises on purpose, with a code from SPEC §4.3.

    Args:
        code: The error code the client sees.
        message: Safe, user-facing English text.
        status_code: The HTTP status of the response.
        retry_after_s: Seconds until a retry makes sense (also sets `Retry-After` on 429 / 503).
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int,
        retry_after_s: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code: ErrorCode = code
        self.message: str = message
        self.status_code: int = status_code
        self.retry_after_s: int | None = retry_after_s


def error_response(
    status_code: int,
    code: ErrorCode,
    message: str,
    retry_after_s: int | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Build a JSON response in the unified error format.

    `retry_after_s` is left out of the body when it is not set (the field is optional in the
    contract). `headers` keeps protocol headers from the framework, such as `Allow` on a 405.
    """
    body = ErrorResponse(error=ErrorBody(code=code, message=message, retry_after_s=retry_after_s))
    response_headers = dict(headers or {})
    if retry_after_s is not None and status_code in _RETRYABLE_STATUSES:
        response_headers["Retry-After"] = str(retry_after_s)
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        headers=response_headers,
    )


def _code_for_status(status_code: int) -> ErrorCode:
    """The error code for a framework HTTP error that our own code did not raise."""
    if status_code == _NOT_FOUND:
        return "not_found"
    if status_code == _TOO_MANY_REQUESTS:
        return "rate_limited"
    if status_code >= _SERVER_ERROR:
        return "internal"
    return "invalid_request"


async def _handle_api_error(_request: Request, exc: Exception) -> JSONResponse:
    # Registered for ApiError only; the isinstance check narrows the type for pyright.
    if not isinstance(exc, ApiError):
        return internal_error_response()
    return error_response(exc.status_code, exc.code, exc.message, exc.retry_after_s)


async def _handle_http_error(_request: Request, exc: Exception) -> JSONResponse:
    # Framework HTTP errors: unknown routes (404), wrong methods (405) and the like.
    if not isinstance(exc, StarletteHTTPException):
        return internal_error_response()
    code = _code_for_status(exc.status_code)
    return error_response(exc.status_code, code, _MESSAGES[code], headers=exc.headers)


async def _handle_validation_error(_request: Request, _exc: Exception) -> JSONResponse:
    # Pydantic's details name internal fields and echo the input; the client gets a plain message.
    return error_response(_UNPROCESSABLE, "invalid_request", _MESSAGES["invalid_request"])


def internal_error_response() -> JSONResponse:
    """The response for an error we did not expect: code `internal`, a generic message."""
    return error_response(_SERVER_ERROR, "internal", _MESSAGES["internal"])


def log_unexpected_error(route: str, error: Exception) -> None:
    """Log an unexpected error with its type and stack, but without its message.

    Exception messages can contain user input, such as a question (fastapi.md, privacy), so only
    the type and the stack (file, line, function) go to the log.
    """
    logger.error(
        "unhandled error",
        extra={
            "route": route,
            "error_code": "internal",
            "error_type": type(error).__name__,
            "stack": "".join(traceback.format_tb(error.__traceback__)),
        },
    )


def install_error_handlers(app: FastAPI) -> None:
    """Register the handlers that map our own and the framework's errors to the unified format.

    Unexpected exceptions are not handled here: `RequestContextMiddleware` turns them into a 500
    (core/request_context.py), so the response also gets the request ID and CORS headers.
    """
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
