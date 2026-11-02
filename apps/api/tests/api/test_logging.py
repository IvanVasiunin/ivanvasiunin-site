"""JSON logging: the fields that may appear, and what must never be logged (fastapi.md, privacy)."""

import json
import logging
import sys
from collections.abc import Iterator

import pytest

from site_api.core.logging import (
    DropUvicornAsgiErrors,
    JsonFormatter,
    configure_logging,
    request_id_var,
)

QUESTION = "What is Ivan's phone number?"


def _record(message: str = "hello", **extra: object) -> logging.LogRecord:
    record = logging.LogRecord("site_api.test", logging.INFO, __file__, 1, message, None, None)
    record.__dict__.update(extra)
    return record


def test_a_line_is_json_with_the_request_id_and_allowed_fields() -> None:
    token = request_id_var.set("req-12345678")
    try:
        line = JsonFormatter().format(_record(route="/api/health", status_code=200))
    finally:
        request_id_var.reset(token)

    entry = json.loads(line)
    assert entry["message"] == "hello"
    assert entry["level"] == "INFO"
    assert entry["request_id"] == "req-12345678"
    assert entry["route"] == "/api/health"
    assert entry["status_code"] == 200
    assert entry["time"].endswith("+00:00")


def test_fields_outside_the_allow_list_are_dropped() -> None:
    line = JsonFormatter().format(_record(question=QUESTION, client_ip="203.0.113.7"))

    assert QUESTION not in line
    assert "203.0.113.7" not in line


def test_an_exception_is_logged_by_type_and_stack_without_its_message() -> None:
    try:
        raise ValueError(QUESTION)
    except ValueError:
        record = _record("failed")
        record.exc_info = sys.exc_info()

    entry = json.loads(JsonFormatter().format(record))

    assert entry["error_type"] == "ValueError"
    assert "test_logging.py" in entry["stack"]
    assert QUESTION not in json.dumps(entry)


def test_uvicorns_duplicate_asgi_error_line_is_dropped() -> None:
    log_filter = DropUvicornAsgiErrors()

    # uvicorn writes the line with a trailing newline (protocols/http/h11_impl.py).
    assert not log_filter.filter(_record("Exception in ASGI application\n"))
    assert log_filter.filter(_record("Started server process"))


@pytest.fixture
def restore_logging() -> Iterator[None]:
    """`configure_logging` changes global loggers; put them back after the test."""
    names = ("", "uvicorn", "uvicorn.error", "uvicorn.access", "httpx", "openai")
    saved = {
        name: (
            logging.getLogger(name).handlers[:],
            logging.getLogger(name).filters[:],
            logging.getLogger(name).propagate,
            logging.getLogger(name).disabled,
            logging.getLogger(name).level,
        )
        for name in names
    }
    yield
    for name, (handlers, filters, propagate, disabled, level) in saved.items():
        logger = logging.getLogger(name)
        logger.handlers = handlers
        logger.filters = filters
        logger.propagate = propagate
        logger.disabled = disabled
        logger.setLevel(level)


@pytest.mark.usefixtures("restore_logging")
def test_configure_logging_routes_everything_to_one_json_handler() -> None:
    configure_logging("DEBUG")
    configure_logging("DEBUG")  # calling it twice must not stack handlers or filters

    root = logging.getLogger()
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)
    assert root.level == logging.DEBUG
    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        # No own handlers and no own level: records go through the JSON handler at LOG_LEVEL.
        assert uvicorn_logger.handlers == []
        assert uvicorn_logger.level == logging.NOTSET
        assert uvicorn_logger.propagate
    filters = logging.getLogger("uvicorn.error").filters
    assert sum(isinstance(item, DropUvicornAsgiErrors) for item in filters) == 1
    # The access log with client IPs is off; libraries that log request bodies stay at WARNING.
    assert logging.getLogger("uvicorn.access").disabled
    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("openai").level == logging.WARNING
