"""Shared fixtures for API contract tests: an app with test settings and a fake database probe."""

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.app import create_app
from site_api.core.config import Settings
from site_api.deps import get_database_probe

# Nothing listens on port 1: Linux refuses at once, Windows times out. Either way the database is
# reliably "down", and the 1 s connect timeout in `settings` keeps the tests fast.
UNREACHABLE_DATABASE_URL = "postgresql+psycopg://site@127.0.0.1:1/site"


class IsolatedSettings(Settings):
    """Settings that never read the developer's real `.env` (only explicit values and the env)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")


class DatabaseState:
    """What the fake probe reports; a test flips `up` to simulate an outage."""

    def __init__(self) -> None:
        self.up: bool = True


@pytest.fixture
def settings() -> Settings:
    return IsolatedSettings(
        app_env="test",
        app_version="test-sha",
        database_url=SecretStr(UNREACHABLE_DATABASE_URL),
        db_connect_timeout_s=1,
    )


@pytest.fixture
def database() -> DatabaseState:
    return DatabaseState()


@pytest.fixture
def app(settings: Settings, database: DatabaseState) -> FastAPI:
    app = create_app(settings)

    async def fake_probe() -> bool:
        return database.up

    app.dependency_overrides[get_database_probe] = lambda: fake_probe
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    # raise_app_exceptions=False: let the app's own 500 handler answer, as in production.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


INTERNAL_DETAIL = "pool exhausted while answering the question about Ivan"


def add_crash_route(app: FastAPI) -> None:
    """Add `GET /api/test/crash`, which fails with an exception whose message must never leak."""

    @app.get("/api/test/crash")
    async def crash() -> None:
        raise RuntimeError(INTERNAL_DETAIL)
