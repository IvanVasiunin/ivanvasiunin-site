"""Shared fixtures for API contract tests: an app with test settings and a fake database probe."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.app import create_app
from site_api.core.config import Settings
from site_api.deps import get_chat_service, get_database_probe
from site_api.graph.nodes import ChatModels
from site_api.services.chat import ChatService
from site_api.services.limits import DailySpend

from .chat_fakes import FakeRetriever, FakeRouterModel, StreamingFakeModel, answering, routing

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


# ── Chat ──────────────────────────────────────────────────────────────────────────────────────

QUESTION = "What does Ivan do?"


class Chat:
    """The service the app uses in a test: swap its retriever or model before a request."""

    def __init__(self, settings: Settings, spend: DailySpend) -> None:
        self.settings: Settings = settings
        # The app's own day spend, which its limits check.
        self.spend: DailySpend = spend
        self.retriever: FakeRetriever = FakeRetriever()
        self.model: StreamingFakeModel = answering("Ivan ", "builds UI.")
        # Every question is about Ivan unless a test routes it elsewhere.
        self.router: FakeRouterModel = routing()

    def service(self) -> ChatService:
        return ChatService(
            self.retriever, ChatModels(self.router, self.model), self.settings, self.spend
        )


@pytest.fixture
def chat(app: FastAPI, settings: Settings) -> Chat:
    """The app's chat service, on fakes: no model, embedding or database call."""
    spend: DailySpend = app.state.daily_spend
    chat = Chat(settings, spend)
    # A function, so a test can replace the model or retriever after the fixture ran.
    app.dependency_overrides[get_chat_service] = chat.service
    return chat


def body(message: str = QUESTION, **extra: object) -> dict[str, object]:
    """A chat request body with a new session."""
    return {"message": message, "session_id": str(uuid.uuid4()), **extra}


def events_of(response: Response) -> list[dict[str, object]]:
    """The JSON `data` of every event, in order; comments (`: ping`) are skipped."""
    events: list[dict[str, object]] = []
    for block in response.text.split("\n\n"):
        data = [
            line.removeprefix("data: ") for line in block.splitlines() if line.startswith("data: ")
        ]
        if data:
            events.append(json.loads("\n".join(data)))
    return events
