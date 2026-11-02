"""Structured JSON logging: one JSON object per line, with the request ID of the current request.

Privacy (fastapi.md): question texts, API keys and IP addresses are never logged.
- `extra` fields pass an allow-list (`_ALLOWED_FIELDS`), so an accidental
  `extra={"question": ...}` never reaches the log.
- Exception messages are left out (they can contain user input); the type and the stack are kept.
- The message itself is written as is, so log messages must be static text: anything variable
  goes into an allow-listed `extra` field, never into the message (`logger.info("request")`, not
  `logger.info(f"question={q}")`).
"""

import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Literal

# The ID of the request being handled, set by `RequestContextMiddleware`. A ContextVar keeps it
# separate for every concurrent request in the same event loop.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# The only `extra` fields that may appear in a log line.
_ALLOWED_FIELDS: tuple[str, ...] = (
    "method",
    "route",
    "status_code",
    "duration_ms",
    "error_code",
    "error_type",
    "stack",
)

# uvicorn's line for an exception that escaped the app (written with a trailing newline). Our
# middleware has already logged it without the message; uvicorn's traceback would print it.
_UVICORN_ASGI_ERROR = "Exception in ASGI application"

# Libraries that can log request URLs, headers or bodies at INFO / DEBUG (an LLM request body is
# the visitor's question). They stay at WARNING whatever LOG_LEVEL says.
_CHATTY_LIBRARIES: tuple[str, ...] = (
    "httpx",
    "httpcore",
    "openai",
    "anthropic",
    "langchain",
    "langfuse",
    "psycopg",
)

type LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class JsonFormatter(logging.Formatter):
    """Formats a record as one JSON line with a fixed set of fields."""

    def format(self, record: logging.LogRecord) -> str:
        """Build the JSON line: time, level, logger, message, request ID and allowed extras."""
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id is not None:
            entry["request_id"] = request_id
        for field in _ALLOWED_FIELDS:
            if field in record.__dict__:
                entry[field] = record.__dict__[field]
        if record.exc_info and record.exc_info[0] is not None:
            # Type and stack only: `str(exception)` can carry user input.
            exc_type, _exc, exc_traceback = record.exc_info
            entry["error_type"] = exc_type.__name__
            entry["stack"] = "".join(traceback.format_tb(exc_traceback))
        # `json.dumps` escapes newlines and control characters, so one record is always one line.
        return json.dumps(entry, ensure_ascii=False, default=str)


class DropUvicornAsgiErrors(logging.Filter):
    """Drops uvicorn's own report of an exception that escaped the app (it is logged already)."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Keep every record except uvicorn's `Exception in ASGI application`."""
        return record.getMessage().strip() != _UVICORN_ASGI_ERROR


def configure_logging(level: LogLevel) -> None:
    """Send every log line, including uvicorn's, to stdout as JSON.

    Called once by the server entry point (`site_api.main`), not by the app factory, so tests keep
    pytest's own log capture. uvicorn configures its loggers before it imports the app, so this
    runs later and wins (also in the reload subprocess of `fastapi dev`).

    - The root logger gets the single JSON handler and `level`.
    - `uvicorn` and `uvicorn.error` lose their own handlers and level (NOTSET = use the root's),
      and pass records to the root logger.
    - `uvicorn.access` is silenced: its lines contain the client IP. `RequestContextMiddleware`
      writes the access line instead (at INFO: `LOG_LEVEL=WARNING` hides it).
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.setLevel(logging.NOTSET)
        uvicorn_logger.propagate = True

    uvicorn_error = logging.getLogger("uvicorn.error")
    if not any(isinstance(existing, DropUvicornAsgiErrors) for existing in uvicorn_error.filters):
        uvicorn_error.addFilter(DropUvicornAsgiErrors())

    access = logging.getLogger("uvicorn.access")
    access.handlers = []
    access.propagate = False
    access.disabled = True

    for name in _CHATTY_LIBRARIES:
        logging.getLogger(name).setLevel(logging.WARNING)
