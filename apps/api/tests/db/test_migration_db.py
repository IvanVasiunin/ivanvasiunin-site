"""The migrations on a live Postgres + pgvector: up → down → up (rules/postgres.md).

Marked `db`: they need a throwaway database at `TEST_DATABASE_URL`, so fast checks leave them out
(`pytest -m db` runs them; CI runs them in the `api-db` job against the production image of
Postgres + pgvector). The tests downgrade to an empty schema, so the database name must end in
`_test`: a URL pointing at a real database fails loudly instead of wiping it.
"""

from collections.abc import Iterator

import pytest
from alembic import command
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Connection, Engine, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from site_api.db.migrate import alembic_config

pytestmark = pytest.mark.db

# The `vector(1536)` of migration 0001 (text-embedding-3-large at 1536 dimensions).
DIMENSIONS = 1536
SHA256 = "a" * 64


def unit_vector(axis: int) -> str:
    """A unit vector along one axis, in pgvector's text input format (`[0,1,0,…]`).

    Two different axes are orthogonal (cosine distance 1), the same axis is identical (distance 0),
    so the nearest-neighbour order in the tests is known in advance.
    """
    values = ["0"] * DIMENSIONS
    values[axis] = "1"
    return "[" + ",".join(values) + "]"


EMBEDDING = unit_vector(0)


class DbTestSettings(BaseSettings):
    """Where the migration tests may create and drop tables. Read from the environment only.

    Not part of `core/config.py` on purpose: the throwaway test database is not app configuration,
    and no `.env` file is read, so a developer's settings can never point these tests elsewhere.
    """

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    test_database_url: SecretStr | None = None


@pytest.fixture(scope="module")
def database_url() -> str:
    """The throwaway database URL; fails (not skips) when it is missing or not a `*_test` DB."""
    url = DbTestSettings().test_database_url
    if url is None:
        pytest.fail(
            "`pytest -m db` needs TEST_DATABASE_URL=postgresql+psycopg://.../<name>_test "
            "(docs/TESTING.md: local Postgres from infra/docker-compose.dev.yml)."
        )
    value = url.get_secret_value()
    name = make_url(value).database or ""
    if not name.endswith("_test"):
        pytest.fail(f"refusing to run migrations against {name!r}: the name must end in '_test'")
    return value


@pytest.fixture(scope="module")
def engine(database_url: str) -> Iterator[Engine]:
    """An engine for assertions; the schema starts empty and ends at head."""
    engine = create_engine(database_url)
    config = alembic_config(database_url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def connection(engine: Engine) -> Iterator[Connection]:
    """A connection whose writes are rolled back after each test."""
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def insert_chunk(connection: Connection, **overrides: object) -> None:
    """Insert one valid chunk, with any column overridden. Parameterized SQL only."""
    row: dict[str, object] = {
        "id": "cv:brainrocket:1",
        "content": "Mentored a trainee to Junior level and onboarded three developers.",
        "embedding": EMBEDDING,
        "source_type": "cv",
        "category": "experience",
        "section": "BrainRocket",
        "content_hash": SHA256,
        "x": 0.25,
        "y": 0.75,
    } | overrides
    connection.execute(
        text(
            "INSERT INTO chunks (id, content, embedding, source_type, category, section, "
            "content_hash, x, y) VALUES (:id, :content, CAST(:embedding AS vector), "
            ":source_type, :category, :section, :content_hash, :x, :y)"
        ),
        row,
    )


def test_upgrade_creates_the_table_and_its_indexes(engine: Engine) -> None:
    inspector = inspect(engine)
    indexes = {index["name"]: index for index in inspector.get_indexes("chunks")}

    assert "chunks" in inspector.get_table_names()
    assert {"ix_chunks_embedding_hnsw", "ix_chunks_tsv", "ix_chunks_source_type"} <= set(indexes)
    with engine.connect() as connection:
        definitions = dict(
            connection.execute(
                text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chunks'")
            ).all()
        )
    assert "USING hnsw (embedding vector_cosine_ops)" in definitions["ix_chunks_embedding_hnsw"]
    assert "USING gin (tsv)" in definitions["ix_chunks_tsv"]


def test_tsv_is_generated_and_searchable(connection: Connection) -> None:
    insert_chunk(connection)

    found = connection.execute(
        text("SELECT id FROM chunks WHERE tsv @@ websearch_to_tsquery('english', :query)"),
        {"query": "mentoring developers"},
    ).scalars()

    assert list(found) == ["cv:brainrocket:1"]


def test_cosine_search_orders_by_similarity(connection: Connection) -> None:
    insert_chunk(connection, id="cv:a:1")
    insert_chunk(connection, id="cv:b:1", embedding=unit_vector(1))

    nearest = connection.execute(
        text("SELECT id FROM chunks ORDER BY embedding <=> CAST(:query AS vector) LIMIT 1"),
        {"query": EMBEDDING},
    ).scalar_one()

    assert nearest == "cv:a:1"


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"source_type": "blog"}, "ck_chunks_source_type"),
        ({"content_hash": "not-a-hash"}, "ck_chunks_content_hash_sha256"),
        ({"x": 1.5}, "ck_chunks_x_range"),
        ({"y": -0.1}, "ck_chunks_y_range"),
        ({"x": None}, "ck_chunks_xy_together"),
    ],
    ids=["unknown source type", "bad hash", "x out of range", "y out of range", "x without y"],
)
def test_constraints_reject_bad_rows(
    connection: Connection, overrides: dict[str, object], constraint: str
) -> None:
    # A failed statement aborts a Postgres transaction. `begin_nested()` is a SAVEPOINT: the error
    # rolls back to it, and the test's outer transaction stays usable for the rollback afterwards.
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        insert_chunk(connection, **overrides)

    # The exact CHECK that refused the row, not just any integrity error.
    diagnostics = getattr(error.value.orig, "diag", None)
    assert getattr(diagnostics, "constraint_name", None) == constraint


def test_points_may_wait_for_the_projection(connection: Connection) -> None:
    insert_chunk(connection, x=None, y=None)

    assert connection.execute(text("SELECT count(*) FROM chunks")).scalar_one() == 1


def test_down_then_up_again(database_url: str, engine: Engine) -> None:
    config = alembic_config(database_url)

    try:
        command.downgrade(config, "base")
        with engine.connect() as connection:
            extension = connection.execute(
                text("SELECT count(*) FROM pg_extension WHERE extname = 'vector'")
            ).scalar_one()
        assert "chunks" not in inspect(engine).get_table_names()
        assert extension == 0
    finally:
        # Back at head whatever happened above, so the other tests never depend on running first.
        command.upgrade(config, "head")

    assert "chunks" in inspect(engine).get_table_names()
