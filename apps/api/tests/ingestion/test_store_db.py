"""`PostgresChunkStore` on a live Postgres + pgvector (ROADMAP 3.4).

Marked `db` like the migration tests: they need a throwaway `*_test` database at
`TEST_DATABASE_URL` (docs/TESTING.md), so fast checks leave them out.
"""

import datetime
from collections.abc import Iterator

import pytest
from alembic import command
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from site_api.db.migrate import alembic_config
from site_api.ingestion.store import ChunkRow, PostgresChunkStore, StoredVector

pytestmark = [pytest.mark.db, pytest.mark.mentor_pending]

DIMENSIONS = 1536


class DbTestSettings(BaseSettings):
    """The throwaway test database URL, from the environment only (never `.env`)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    test_database_url: SecretStr | None = None


def vector(axis: int) -> list[float]:
    values = [0.0] * DIMENSIONS
    values[axis] = 1.0
    return values


def row(chunk_id: str, content: str, url: str | None = None) -> ChunkRow:
    return ChunkRow(
        id=chunk_id,
        content=content,
        source_type="cv",
        category="job",
        section="Acme — Dev",
        project=None,
        url=url,
        source_date=datetime.date(2024, 11, 1),
        content_hash=(content.encode().hex() * 64)[:64],
    )


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    url = DbTestSettings().test_database_url
    if url is None:
        pytest.fail("`pytest -m db` needs TEST_DATABASE_URL=postgresql+psycopg://.../<name>_test")
    value = url.get_secret_value()
    if not (make_url(value).database or "").endswith("_test"):
        pytest.fail("refusing to touch a database whose name does not end in '_test'")
    config = alembic_config(value)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine = create_engine(value)
    yield engine
    engine.dispose()


@pytest.fixture
def store(engine: Engine) -> Iterator[PostgresChunkStore]:
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM chunks"))
    yield PostgresChunkStore(engine)


def test_apply_then_load_round_trips(store: PostgresChunkStore) -> None:
    a, b = row("cv:acme:0", "I build UI."), row("cv:acme:1", "I review code.")

    store.apply([(a, StoredVector(vector(0))), (b, StoredVector(vector(1)))], [])

    assert store.load_rows() == {"cv:acme:0": a, "cv:acme:1": b}
    assert store.load_vectors({a.content_hash}) == {a.content_hash: StoredVector(vector(0))}


def test_delete_removes_rows(store: PostgresChunkStore) -> None:
    a = row("cv:acme:0", "I build UI.")
    store.apply([(a, StoredVector(vector(0)))], [])

    store.apply([], ["cv:acme:0"])

    assert store.load_rows() == {}


def set_coordinates(engine: Engine, chunk_id: str) -> None:
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE chunks SET x = 0.5, y = 0.5 WHERE id = :id"), {"id": chunk_id}
        )


def coordinates(engine: Engine, chunk_id: str) -> tuple[object, object]:
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT x, y FROM chunks WHERE id = :id"), {"id": chunk_id}
        )
        x, y = result.one()
    return x, y


def test_metadata_update_keeps_the_map_point(store: PostgresChunkStore, engine: Engine) -> None:
    a = row("cv:acme:0", "I build UI.")
    store.apply([(a, StoredVector(vector(0)))], [])
    set_coordinates(engine, "cv:acme:0")

    store.apply(
        [(row("cv:acme:0", "I build UI.", url="/cv#job-acme"), StoredVector(vector(0)))], []
    )

    assert coordinates(engine, "cv:acme:0") == (0.5, 0.5)


def test_text_update_resets_the_map_point(store: PostgresChunkStore, engine: Engine) -> None:
    store.apply([(row("cv:acme:0", "I build UI."), StoredVector(vector(0)))], [])
    set_coordinates(engine, "cv:acme:0")

    store.apply([(row("cv:acme:0", "I build fast UI."), StoredVector(vector(1)))], [])

    assert coordinates(engine, "cv:acme:0") == (None, None)


def test_column_size_is_read_from_the_table(store: PostgresChunkStore) -> None:
    assert store.embedding_dimensions() == DIMENSIONS


def test_a_new_row_takes_the_map_point_passed_in(store: PostgresChunkStore, engine: Engine) -> None:
    # A chunk whose id shifted arrives with the point of the stored row that had its text.
    store.apply([(row("cv:acme:5", "I build UI."), StoredVector(vector(0), 0.25, 0.75))], [])

    assert coordinates(engine, "cv:acme:5") == (0.25, 0.75)
