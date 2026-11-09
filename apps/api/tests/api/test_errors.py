"""The unified error format (SPEC §4.3): every error has the same shape and leaks nothing."""

import logging

import pytest
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient
from pydantic import BaseModel

from site_api.core.errors import ApiError

INTERNAL_DETAIL = "connection to db-internal:5432 failed for user site"


class Echo(BaseModel):
    text: str


@pytest.fixture(autouse=True)
def register_error_routes(app: FastAPI) -> None:
    """Routes that exist only in tests, to trigger each kind of error."""

    @app.post("/api/test/echo")
    async def echo(body: Echo) -> Echo:
        return body

    @app.get("/api/test/rate-limited")
    async def rate_limited() -> None:
        raise ApiError("rate_limited", "Too many questions in a short time.", 429, 30)

    @app.get("/api/test/session-limit")
    async def session_limit() -> None:
        raise ApiError("session_limit", "This conversation has reached its limit.", 429)

    @app.get("/api/test/framework-rate-limit")
    async def framework_rate_limit() -> None:
        raise HTTPException(status_code=429)

    @app.get("/api/test/upstream-down")
    async def upstream_down() -> None:
        raise ApiError("upstream_unavailable", "The assistant is unavailable right now.", 503, 60)

    @app.get("/api/test/crash")
    async def crash() -> None:
        raise RuntimeError(INTERNAL_DETAIL)


async def test_an_unknown_route_is_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/nowhere")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "There is nothing at this address."}
    }


async def test_a_wrong_method_is_an_invalid_request_and_keeps_allow(client: AsyncClient) -> None:
    response = await client.post("/api/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "invalid_request"
    # RFC 9110: a 405 lists the allowed methods.
    assert response.headers["allow"] == "GET"


async def test_a_validation_error_hides_the_validator_details(client: AsyncClient) -> None:
    response = await client.post("/api/test/echo", json={"text": 42})

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "invalid_request", "message": "The request is not valid."}
    }


async def test_a_retryable_error_carries_retry_after(client: AsyncClient) -> None:
    response = await client.get("/api/test/rate-limited")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "30"
    assert response.json() == {
        "error": {
            "code": "rate_limited",
            "message": "Too many questions in a short time.",
            "retry_after_s": 30,
        }
    }


async def test_a_framework_429_is_rate_limited(client: AsyncClient) -> None:
    response = await client.get("/api/test/framework-rate-limit")

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


async def test_a_503_carries_retry_after_too(client: AsyncClient) -> None:
    response = await client.get("/api/test/upstream-down")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "60"
    assert response.json()["error"]["retry_after_s"] == 60


async def test_retry_after_is_omitted_when_there_is_none(client: AsyncClient) -> None:
    response = await client.get("/api/test/session-limit")

    assert response.status_code == 429
    assert "retry-after" not in response.headers
    assert response.json()["error"] == {
        "code": "session_limit",
        "message": "This conversation has reached its limit.",
    }


async def test_an_unexpected_error_is_internal_and_leaks_nothing(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="site_api.core.errors"):
        response = await client.get("/api/test/crash")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal",
            "message": "Something went wrong on our side. Please try again.",
        }
    }
    assert INTERNAL_DETAIL not in response.text
    assert "Traceback" not in response.text
    # The server log gets the type, the route template and the stack, but not the exception
    # message: messages can carry user input.
    [record] = caplog.records
    assert getattr(record, "error_type", None) == "RuntimeError"
    assert getattr(record, "route", None) == "/api/test/crash"
    assert "crash" in str(getattr(record, "stack", ""))
    assert INTERNAL_DETAIL not in record.getMessage() + str(record.__dict__)


async def test_the_openapi_schema_documents_errors_in_the_unified_format(app: FastAPI) -> None:
    schema = app.openapi()
    echo_responses = schema["paths"]["/api/test/echo"]["post"]["responses"]

    assert echo_responses["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ErrorResponse"
    }
    # FastAPI's own validation error shape is never returned, so it is not documented either.
    assert "HTTPValidationError" not in schema["components"]["schemas"]
