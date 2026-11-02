"""Settings: required values, secrets kept out of reprs, safe defaults, production behaviour."""

from pathlib import Path
from typing import Literal

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr, ValidationError

from site_api.app import create_app
from site_api.core import config
from site_api.core.config import Settings, find_env_file

from .conftest import UNREACHABLE_DATABASE_URL, IsolatedSettings


def test_the_env_file_is_found_at_the_repository_root() -> None:
    env_file = find_env_file(Path(config.__file__))

    # The repository root is the folder with `.env.example` (the real `.env` is never read here).
    assert env_file is not None
    assert (env_file.parent / ".env.example").is_file()
    assert (env_file.parent / "apps" / "api" / "pyproject.toml").is_file()


def test_outside_the_repository_there_is_no_env_file(tmp_path: Path) -> None:
    assert find_env_file(tmp_path / "site_api" / "core" / "config.py") is None


def test_the_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="database_url"):
        IsolatedSettings()  # pyright: ignore[reportCallIssue] -- the missing field is the point


def test_without_app_env_the_app_behaves_as_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)

    settings = IsolatedSettings(database_url=SecretStr(UNREACHABLE_DATABASE_URL))

    assert settings.is_production


def test_values_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_DATABASE_URL)
    monkeypatch.setenv("APP_VERSION", "abc1234")
    monkeypatch.setenv("APP_ENV", "development")

    settings = IsolatedSettings()  # pyright: ignore[reportCallIssue] -- read from the env

    assert settings.app_version == "abc1234"
    assert not settings.is_production
    assert settings.database_url.get_secret_value() == UNREACHABLE_DATABASE_URL


def test_the_database_url_never_appears_in_reprs(settings: Settings) -> None:
    assert "127.0.0.1" not in repr(settings)
    assert "127.0.0.1" not in str(settings.model_dump())


def test_the_health_timeout_is_bounded() -> None:
    with pytest.raises(ValidationError):
        IsolatedSettings(
            database_url=SecretStr(UNREACHABLE_DATABASE_URL),
            db_health_timeout_s=0,
        )


@pytest.mark.parametrize(
    ("app_env", "expected_status"), [("development", 200), ("production", 404)]
)
async def test_docs_and_schema_are_served_only_outside_production(
    app_env: Literal["development", "production"], expected_status: int
) -> None:
    settings = IsolatedSettings(app_env=app_env, database_url=SecretStr(UNREACHABLE_DATABASE_URL))
    transport = ASGITransport(app=create_app(settings))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        docs = await client.get("/api/docs")
        schema = await client.get("/api/openapi.json")

    assert docs.status_code == expected_status
    assert schema.status_code == expected_status
