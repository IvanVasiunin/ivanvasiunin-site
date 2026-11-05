"""Chat statistics on a live Postgres (ROADMAP 4.6, rules/postgres.md): insert, then retention.

Marked `db`: needs a throwaway `*_test` database at `TEST_DATABASE_URL` (docs/TESTING.md).
"""

from collections.abc import AsyncIterator

import pytest
from alembic import command
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from site_api.db.migrate import alembic_config
from site_api.services.stats import AnswerRecord, PostgresStats

pytestmark = pytest.mark.db

RECORD = AnswerRecord(
    route="about_ivan",
    language="en",
    finish_reason="stop",
    error_code=None,
    cost_usd=0.000496,
    total_ms=1840,
    question_masked="Write to [email] about BrainRocket",
)


class DbTestSettings(BaseSettings):
    """The throwaway test database, from the environment only (never `.env`)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    test_database_url: SecretStr | None = None


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    url = DbTestSettings().test_database_url
    if url is None:
        pytest.fail("`pytest -m db` needs TEST_DATABASE_URL (docs/TESTING.md)")
    value = url.get_secret_value()
    if not (make_url(value).database or "").endswith("_test"):
        pytest.fail("refusing to touch a database whose name does not end in '_test'")
    command.upgrade(alembic_config(value), "head")
    engine = create_async_engine(value)
    async with engine.begin() as connection:
        await connection.execute(text("DELETE FROM chat_answers"))
    yield engine
    await engine.dispose()


async def test_a_record_becomes_one_row(engine: AsyncEngine) -> None:
    await PostgresStats(engine).record(RECORD)

    async with engine.connect() as connection:
        row = (await connection.execute(text("SELECT * FROM chat_answers"))).mappings().one()
    assert row["route"] == "about_ivan"
    assert row["question_masked"] == "Write to [email] about BrainRocket"
    assert float(row["cost_usd"]) == pytest.approx(0.000496)
    assert row["created_at"] is not None


async def test_retention_deletes_only_rows_older_than_the_period(engine: AsyncEngine) -> None:
    stats = PostgresStats(engine)
    await stats.record(RECORD)
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO chat_answers (created_at, route, cost_usd, question_masked) "
                "VALUES (now() - interval '40 days', 'greeting', 0, 'Hi')"
            )
        )

    deleted = await stats.purge(older_than_days=30)

    assert deleted == 1
    async with engine.connect() as connection:
        routes = (await connection.execute(text("SELECT route FROM chat_answers"))).scalars().all()
    assert routes == ["about_ivan"]
