"""The unified error body (SPEC §4.3): one shape for every error the API returns before a stream.

The same codes are used by the chat stream's `error` event (SPEC §4.2), so the frontend has one
place to turn a code into a message.
"""

from typing import Literal

from pydantic import BaseModel, Field

ErrorCode = Literal[
    # Only before a stream (SPEC §4.3).
    "invalid_request",
    "not_found",
    # Also used by the chat stream's `error` event (SPEC §4.2).
    "input_too_long",
    "rate_limited",
    "session_limit",
    "budget_exceeded",
    "upstream_unavailable",
    "timeout",
    "internal",
]


class ErrorBody(BaseModel):
    """What went wrong, in terms that are safe to show to a visitor."""

    code: ErrorCode
    # User-facing English text. Never an exception message or a stack trace.
    message: str
    # Only for errors that can be retried later, such as `rate_limited`.
    retry_after_s: int | None = Field(default=None, ge=0)


class ErrorResponse(BaseModel):
    """The JSON body of every error response: `{"error": {...}}`."""

    error: ErrorBody
