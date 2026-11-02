"""CORS: only configured origins, localhost only in development, never `*` (fastapi.md)."""

from collections.abc import AsyncIterator
from typing import Literal

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr, ValidationError

from site_api.app import create_app

from .conftest import UNREACHABLE_DATABASE_URL, IsolatedSettings, add_crash_route

SITE = "https://ivanvasiunin.com"


def _app(app_env: Literal["development", "production"]) -> FastAPI:
    app = create_app(
        IsolatedSettings(
            app_env=app_env,
            database_url=SecretStr(UNREACHABLE_DATABASE_URL),
            cors_allow_origins=[SITE],
        )
    )
    add_crash_route(app)
    return app


@pytest.fixture
async def production() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_app("production"), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def development() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_app("development"), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_the_configured_site_is_allowed(production: AsyncClient) -> None:
    response = await production.get("/api/nowhere", headers={"Origin": SITE})

    assert response.headers["access-control-allow-origin"] == SITE
    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()


@pytest.mark.parametrize(
    "origin", ["https://evil.example", "http://localhost:4321", SITE + ".evil"]
)
async def test_other_origins_are_not_allowed_in_production(
    production: AsyncClient, origin: str
) -> None:
    response = await production.get("/api/nowhere", headers={"Origin": origin})

    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", ["http://localhost:4321", "http://127.0.0.1:4321"])
async def test_local_dev_servers_are_allowed_in_development(
    development: AsyncClient, origin: str
) -> None:
    response = await development.get("/api/nowhere", headers={"Origin": origin})

    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:4321.evil.com",
        "http://localhost:4321@evil.com",
        "http://localhost.evil.com:80",
        "http://localhost:",
        "https://localhost:4321",
    ],
)
async def test_lookalike_local_origins_are_refused_in_development(
    development: AsyncClient, origin: str
) -> None:
    response = await development.get("/api/nowhere", headers={"Origin": origin})

    assert "access-control-allow-origin" not in response.headers


async def test_a_preflight_allows_only_get_and_post(production: AsyncClient) -> None:
    response = await production.options(
        "/api/health",
        headers={"Origin": SITE, "Access-Control-Request-Method": "POST"},
    )

    assert response.status_code == 200
    assert set(response.headers["access-control-allow-methods"].split(", ")) == {"GET", "POST"}


async def test_a_500_still_carries_cors_headers(production: AsyncClient) -> None:
    response = await production.get("/api/test/crash", headers={"Origin": SITE})

    assert response.status_code == 500
    # Without them the browser would report a CORS failure instead of the error body.
    assert response.headers["access-control-allow-origin"] == SITE


@pytest.mark.parametrize(
    "origin",
    ["*", "https://*.example.com", "https://ivanvasiunin.com/", "ivanvasiunin.com", "null", ""],
)
def test_origins_must_be_exact(origin: str) -> None:
    with pytest.raises(ValidationError, match="CORS origin"):
        IsolatedSettings(
            database_url=SecretStr(UNREACHABLE_DATABASE_URL), cors_allow_origins=[origin]
        )


def test_an_origin_with_a_port_is_accepted() -> None:
    settings = IsolatedSettings(
        database_url=SecretStr(UNREACHABLE_DATABASE_URL),
        cors_allow_origins=["https://ivanvasiunin.com", "http://staging.example:8080"],
    )

    assert len(settings.cors_allow_origins) == 2
