"""The two searches of hybrid retrieval, in SQL over the `chunks` table (ROADMAP 3.6).

Hand-written queries instead of `PGVectorStore` (ADR-0003 amendment of 2026-11-04): every
langchain-postgres release pins `pgvector<0.4` and `psycopg[binary]`, which conflict with the
stack, and ADR-0008 records this fallback. The queries are short and use the existing indexes:
HNSW (cosine) for the vector search, GIN on `tsv` for the full-text search.
"""

from dataclasses import dataclass
from typing import Protocol

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine

from site_api.db.tables import CHUNKS
from site_api.schemas.chat import SourceType


@dataclass(frozen=True)
class Candidate:
    """A chunk found by one search, with what retrieval and the answer need."""

    chunk_id: str
    content: str
    source_type: SourceType
    category: str
    section: str
    project: str | None
    url: str | None
    # Cosine similarity to the question (1 = same direction), from the vector search; `None` for a
    # chunk only the full-text search found. The relevance gate reads it (ROADMAP 4.3): unlike the
    # rank-based RRF score, it says how close the best chunk really is to the question.
    similarity: float | None = None


class ChunkSearch(Protocol):
    """The two searches; `HybridRetriever` fuses their rankings."""

    async def by_vector(self, embedding: list[float], limit: int) -> list[Candidate]:
        """The nearest chunks by cosine distance, nearest first."""
        ...

    async def by_text(self, question: str, limit: int) -> list[Candidate]:
        """The chunks matching the question's words, best `ts_rank_cd` first."""
        ...


_COLUMNS = (
    CHUNKS.c.id,
    CHUNKS.c.content,
    CHUNKS.c.source_type,
    CHUNKS.c.category,
    CHUNKS.c.section,
    CHUNKS.c.project,
    CHUNKS.c.url,
)


def any_word_query(question: str) -> sa.ColumnElement[object]:
    """A tsquery matching chunks that contain ANY of the question's words (OR, not AND).

    `plainto_tsquery` turns any user text into stemmed words without stop words, joined by AND
    (`'ivan' & 'work'`), and never fails on symbols. With AND, a natural question matches only
    chunks that contain every word, which is almost none; replacing `&` with `|` asks for any of
    them, and the ranking prefers chunks with more. 'english' matches the `tsv` column.
    """
    words = sa.cast(sa.func.plainto_tsquery("english", question), sa.Text)
    return sa.func.to_tsquery("english", sa.func.replace(words, "&", "|"))


class PostgresChunkSearch:
    """`ChunkSearch` on Postgres + pgvector through the API's async engine."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Use the app's engine (one pool per process, `db/engine.py`)."""
        self._engine = engine

    async def by_vector(self, embedding: list[float], limit: int) -> list[Candidate]:
        """The nearest chunks by cosine distance, nearest first."""
        # `<=>` is pgvector's cosine distance, the operator the HNSW index (vector_cosine_ops)
        # was built for; ORDER BY distance + LIMIT lets Postgres use that index.
        distance = CHUNKS.c.embedding.cosine_distance(embedding)
        # Cosine similarity = 1 - cosine distance; selected so the relevance gate can read it.
        similarity = (1 - distance).label("similarity")
        query = sa.select(*_COLUMNS, similarity).order_by(distance).limit(limit)
        return await self._fetch(query)

    async def by_text(self, question: str, limit: int) -> list[Candidate]:
        """The chunks matching any of the question's words, best `ts_rank` first."""
        tsquery = any_word_query(question)
        # ts_rank counts matching words, so a chunk with more of the question's words ranks
        # higher; the `tsv` weights make a match in the section heading (A) count more than one
        # in the body (B).
        rank = sa.func.ts_rank(CHUNKS.c.tsv, tsquery)
        query = (
            sa.select(*_COLUMNS)
            .where(CHUNKS.c.tsv.bool_op("@@")(tsquery))
            .order_by(rank.desc(), CHUNKS.c.id)
            .limit(limit)
        )
        return await self._fetch(query)

    async def _fetch(self, query: sa.Executable) -> list[Candidate]:
        """Run a query over `_COLUMNS` and build the candidates, in the query's order."""
        async with self._engine.connect() as connection:
            result = await connection.execute(query)
            return [
                Candidate(
                    chunk_id=row["id"],
                    content=row["content"],
                    source_type=row["source_type"],
                    category=row["category"],
                    section=row["section"],
                    project=row["project"],
                    url=row["url"],
                    similarity=_similarity(row.get("similarity")),
                )
                for row in result.mappings()
            ]


def _similarity(value: object) -> float | None:
    """The row's similarity as a float, or `None` when the query did not select one."""
    return float(value) if isinstance(value, (int, float)) else None
