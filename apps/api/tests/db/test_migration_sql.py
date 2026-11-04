"""The migrations rendered as SQL, without a database (Alembic offline mode).

Fast checks cannot rely on Postgres being up, so this pins the DDL itself: the table, the vector
column, the generated full-text column, the constraints and the indexes ADR-0003 asks for. The
live up / down / up cycle on a real Postgres + pgvector is in `test_migration_db.py` (marker `db`).
"""

import io
import re

from alembic import command

from site_api.db.migrate import alembic_config

# Offline mode only needs a URL to pick the SQL dialect; nothing connects to it.
OFFLINE_URL = "postgresql+psycopg://offline@localhost/offline"


def render(direction: str, revisions: str) -> str:
    """The SQL Alembic would run for `upgrade` / `downgrade` over `revisions`, normalised."""
    buffer = io.StringIO()
    config = alembic_config(OFFLINE_URL)
    config.output_buffer = buffer
    if direction == "upgrade":
        command.upgrade(config, revisions, sql=True)
    else:
        command.downgrade(config, revisions, sql=True)
    return re.sub(r"\s+", " ", buffer.getvalue())


def test_upgrade_enables_pgvector_before_the_table() -> None:
    sql = render("upgrade", "head")

    assert "CREATE EXTENSION IF NOT EXISTS vector" in sql
    assert sql.index("CREATE EXTENSION") < sql.index("CREATE TABLE chunks")


def test_chunks_has_the_reviewed_columns() -> None:
    sql = render("upgrade", "head")

    for column in [
        "id TEXT NOT NULL",
        "content TEXT NOT NULL",
        "embedding VECTOR(1536) NOT NULL",
        "source_type TEXT NOT NULL",
        "category TEXT NOT NULL",
        "section TEXT NOT NULL",
        "project TEXT",
        "url TEXT",
        "source_date DATE",
        "content_hash TEXT NOT NULL",
        "x REAL",
        "y REAL",
        "created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL",
        "updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL",
    ]:
        assert column in sql, column


def test_tsv_is_generated_from_section_and_content_in_english() -> None:
    sql = render("upgrade", "head")

    assert (
        "tsv TSVECTOR GENERATED ALWAYS AS (setweight(to_tsvector('english', section), 'A') || "
        "setweight(to_tsvector('english', content), 'B')) STORED NOT NULL"
    ) in sql


def test_constraints_guard_the_data() -> None:
    sql = render("upgrade", "head")

    assert "CONSTRAINT pk_chunks PRIMARY KEY (id)" in sql
    assert (
        "CONSTRAINT ck_chunks_source_type CHECK (source_type IN "
        "('cv', 'experience', 'personal', 'site_docs', 'github_readme'))"
    ) in sql
    assert "CONSTRAINT ck_chunks_content_hash_sha256 CHECK (content_hash ~ '^[0-9a-f]{64}$')" in sql
    assert "CONSTRAINT ck_chunks_x_range CHECK (x IS NULL OR (x >= 0 AND x <= 1))" in sql
    assert "CONSTRAINT ck_chunks_y_range CHECK (y IS NULL OR (y >= 0 AND y <= 1))" in sql
    assert "CONSTRAINT ck_chunks_xy_together CHECK ((x IS NULL) = (y IS NULL))" in sql


def test_indexes_hnsw_cosine_gin_and_source_type() -> None:
    sql = render("upgrade", "head")

    assert (
        "CREATE INDEX ix_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)"
        in sql
    )
    assert "CREATE INDEX ix_chunks_tsv ON chunks USING gin (tsv)" in sql
    assert "CREATE INDEX ix_chunks_source_type ON chunks (source_type)" in sql


def test_downgrade_drops_the_table_and_the_extension() -> None:
    sql = render("downgrade", "head:base")

    assert "DROP TABLE chunks" in sql
    assert "DROP EXTENSION IF EXISTS vector" in sql
    assert sql.index("DROP TABLE chunks") < sql.index("DROP EXTENSION")
