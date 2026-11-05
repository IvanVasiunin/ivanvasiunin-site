"""Read and write the `chunks` table for ingestion (ROADMAP 3.4).

The sync logic (`sync.py`) talks to a `ChunkStore` protocol, so its tests use an in-memory fake
and the SQL lives here alone. Alembic owns the table (ADR-0003); `db/tables.py` only describes
its columns for building queries.
"""

import datetime
from collections.abc import Collection, Sequence
from dataclasses import asdict, dataclass, fields
from typing import Protocol

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from site_api.db.tables import CHUNKS
from site_api.schemas.chat import SourceType


@dataclass(frozen=True)
class ChunkRow:
    """One row of `chunks` without its embedding and map point (those are a `StoredVector`).

    Frozen dataclasses compare field by field, so "is this row unchanged?" is `stored == planned`.
    """

    id: str
    content: str
    source_type: SourceType
    category: str
    section: str
    project: str | None
    url: str | None
    source_date: datetime.date | None
    content_hash: str


@dataclass(frozen=True)
class StoredVector:
    """What belongs to a text rather than to a row: its embedding and its point on the map.

    Both are reused for any row with the same content hash, so a chunk whose id shifted keeps its
    embedding (no paid call) and its map point (ADR-0006: the map stays stable).
    """

    embedding: list[float]
    x: float | None = None
    y: float | None = None


class ChunkStore(Protocol):
    """What the sync needs from storage: read the rows, reuse vectors, apply the changes."""

    def load_rows(self) -> dict[str, ChunkRow]:
        """Every stored row, by id."""
        ...

    def load_vectors(self, hashes: Collection[str]) -> dict[str, StoredVector]:
        """Stored vectors for these content hashes (missing hashes are left out)."""
        ...

    def embedding_dimensions(self) -> int:
        """The size of the stored embedding column (`vector(1536)` → 1536)."""
        ...

    def apply(
        self, upserts: Sequence[tuple[ChunkRow, StoredVector]], delete_ids: Collection[str]
    ) -> None:
        """Insert or update these rows and delete these ids, all in one transaction."""
        ...


# The ChunkRow fields in order; `id` comes first, the columns an update may change follow it.
ROW_COLUMNS: tuple[str, ...] = tuple(field.name for field in fields(ChunkRow))


class PostgresChunkStore:
    """`ChunkStore` on the real table, through a synchronous SQLAlchemy engine.

    Ingestion is a one-off command, not a request handler, so plain sync code is simpler and does
    not block anyone (rules/fastapi.md: CPU-heavy work belongs to ingestion).
    """

    def __init__(self, engine: sa.Engine) -> None:
        """Use this engine; the caller owns it and disposes of it."""
        self._engine = engine

    def load_rows(self) -> dict[str, ChunkRow]:
        """Every stored row, by id."""
        query = sa.select(*(CHUNKS.c[name] for name in ROW_COLUMNS))
        with self._engine.connect() as connection:
            # `.mappings()`: each result row as a {column: value} dict, ready for **kwargs.
            return {row["id"]: ChunkRow(**row) for row in connection.execute(query).mappings()}

    def load_vectors(self, hashes: Collection[str]) -> dict[str, StoredVector]:
        """Stored vectors for these content hashes (missing hashes are left out)."""
        if not hashes:
            return {}
        query = sa.select(CHUNKS.c.content_hash, CHUNKS.c.embedding, CHUNKS.c.x, CHUNKS.c.y).where(
            CHUNKS.c.content_hash.in_(list(hashes))
        )
        vectors: dict[str, StoredVector] = {}
        with self._engine.connect() as connection:
            for row in connection.execute(query).mappings():
                key = str(row["content_hash"])
                # Rows with one hash share the embedding; prefer one that already has a map point.
                if key not in vectors or vectors[key].x is None:
                    embedding = [float(value) for value in row["embedding"]]
                    vectors[key] = StoredVector(embedding, row["x"], row["y"])
        return vectors

    def embedding_dimensions(self) -> int:
        """The size of the stored embedding column (`vector(1536)` → 1536)."""
        # For pgvector's `vector(n)`, Postgres stores n as the column's type modifier.
        query = sa.text(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = 'chunks'::regclass AND attname = 'embedding'"
        )
        with self._engine.connect() as connection:
            return int(connection.execute(query).scalar_one())

    def apply(
        self, upserts: Sequence[tuple[ChunkRow, StoredVector]], delete_ids: Collection[str]
    ) -> None:
        """Insert or update these rows and delete these ids, all in one transaction."""
        # engine.begin(): commits at the end of the block, rolls everything back on an error, so a
        # failed run never leaves a half-updated knowledge base.
        with self._engine.begin() as connection:
            if upserts:
                params = [asdict(row) | asdict(vector) for row, vector in upserts]
                connection.execute(upsert_statement(), params)
            if delete_ids:
                connection.execute(sa.delete(CHUNKS).where(CHUNKS.c.id.in_(list(delete_ids))))


def upsert_statement() -> sa.Insert:
    """`INSERT … ON CONFLICT (id) DO UPDATE`; the map point follows the text (ADR-0006).

    Same text as stored: the row keeps its point. New text: it takes the point passed in (from a
    row with the same hash) or NULL, and the projection (6.1) places it.
    """
    statement = insert(CHUNKS)
    # `excluded` is the row that failed to insert; the plain `CHUNKS.c` columns are the stored row.
    same_text = CHUNKS.c.content_hash == statement.excluded.content_hash
    updates: dict[str, object] = {name: statement.excluded[name] for name in ROW_COLUMNS[1:]}
    updates["embedding"] = statement.excluded.embedding
    updates["x"] = sa.case((same_text, CHUNKS.c.x), else_=statement.excluded.x)
    updates["y"] = sa.case((same_text, CHUNKS.c.y), else_=statement.excluded.y)
    updates["updated_at"] = sa.func.now()
    return statement.on_conflict_do_update(index_elements=[CHUNKS.c.id], set_=updates)
