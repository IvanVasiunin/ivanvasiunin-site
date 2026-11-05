"""Hybrid retrieval on a live Postgres + pgvector with a fixture corpus (ROADMAP 3.6 DoD).

Marked `db`: needs a throwaway `*_test` database at `TEST_DATABASE_URL` (docs/TESTING.md).
Embeddings are unit vectors along chosen axes, so the vector ranking is known in advance.
"""

import datetime
from collections.abc import AsyncIterator, Iterator
from typing import cast

import pytest
from alembic import command
from langchain_core.embeddings import Embeddings
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from site_api.db.migrate import alembic_config
from site_api.ingestion.store import ChunkRow, PostgresChunkStore, StoredVector
from site_api.ingestion.sync import content_hash
from site_api.rag.retrieval import HybridRetriever, RetrievalParams
from site_api.rag.search import PostgresChunkSearch
from site_api.schemas.chat import SourceType

pytestmark = [pytest.mark.db, pytest.mark.mentor_pending]

DIMENSIONS = 1536

# (id, section, content, project, embedding axis)
CORPUS = [
    (
        "cv:brainrocket:0",
        "BrainRocket — Senior Markup Developer",
        "I build UI for iGaming platforms with semantic HTML, SCSS and BEM.",
        None,
        0,
    ),
    (
        "personal:about-me-personal:3",
        "Does he have a pet?",
        "Yes, Ivan has a dog named Monty, a three-year-old corgi.",
        None,
        1,
    ),
    (
        "github_readme:numbers-validator:0",
        "NumbersValidator",
        "A web service for phone number checking and validation to E.164.",
        "numbers-validator",
        2,
    ),
    (
        "site_docs:0003-vector-database:0",
        "Decision",
        "Hybrid search combines vector similarity and full-text search with RRF.",
        None,
        3,
    ),
]


class DbTestSettings(BaseSettings):
    """The throwaway test database URL, from the environment only (never `.env`)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    test_database_url: SecretStr | None = None


def axis(index: int) -> list[float]:
    values = [0.0] * DIMENSIONS
    values[index] = 1.0
    return values


class AxisEmbeddings(Embeddings):
    """Embeds every question as the unit vector of one axis."""

    def __init__(self, index: int) -> None:
        self.index = index

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> list[float]:
        return axis(self.index)


@pytest.fixture(scope="module")
def database_url() -> str:
    url = DbTestSettings().test_database_url
    if url is None:
        pytest.fail("`pytest -m db` needs TEST_DATABASE_URL=postgresql+psycopg://.../<name>_test")
    value = url.get_secret_value()
    if not (make_url(value).database or "").endswith("_test"):
        pytest.fail("refusing to touch a database whose name does not end in '_test'")
    return value


@pytest.fixture(scope="module")
def corpus(database_url: str) -> Iterator[Engine]:
    """The schema at head with the fixture corpus in it."""
    config = alembic_config(database_url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM chunks"))
    rows = [
        (
            ChunkRow(
                id=chunk_id,
                content=content,
                source_type=cast("SourceType", chunk_id.split(":", 1)[0]),
                category="fixture",
                section=section,
                project=project,
                url=None,
                source_date=datetime.date(2026, 11, 1),
                content_hash=content_hash(content),
            ),
            StoredVector(axis(index)),
        )
        for chunk_id, section, content, project, index in CORPUS
    ]
    PostgresChunkStore(engine).apply(rows, [])
    yield engine
    engine.dispose()


@pytest.fixture
async def search(corpus: Engine, database_url: str) -> AsyncIterator[PostgresChunkSearch]:
    engine: AsyncEngine = create_async_engine(database_url)
    yield PostgresChunkSearch(engine)
    await engine.dispose()


async def test_vector_search_orders_by_cosine_distance(search: PostgresChunkSearch) -> None:
    found = await search.by_vector(axis(1), limit=2)

    assert found[0].chunk_id == "personal:about-me-personal:3"
    assert len(found) == 2


async def test_vector_search_reports_each_chunks_cosine_similarity(
    search: PostgresChunkSearch,
) -> None:
    # ROADMAP 4.3: the relevance gate reads it. The query equals one chunk's unit vector, so that
    # chunk has similarity 1 and an orthogonal one 0.
    found = await search.by_vector(axis(1), limit=2)

    assert found[0].similarity == pytest.approx(1.0)
    assert found[1].similarity is not None
    assert found[1].similarity < 1.0


async def test_text_search_leaves_the_similarity_unknown(search: PostgresChunkSearch) -> None:
    found = await search.by_text("corgi", limit=1)

    assert found[0].similarity is None


async def test_text_search_finds_exact_terms(search: PostgresChunkSearch) -> None:
    found = await search.by_text("corgi", limit=10)

    assert [c.chunk_id for c in found] == ["personal:about-me-personal:3"]


async def test_text_search_stems_words(search: PostgresChunkSearch) -> None:
    # English stemming: "validating" matches "validation".
    found = await search.by_text("validating numbers", limit=10)

    assert [c.chunk_id for c in found] == ["github_readme:numbers-validator:0"]


async def test_a_natural_question_matches_any_of_its_words(search: PostgresChunkSearch) -> None:
    # "Ivan" and "dog" are never in one chunk with "work"; OR still finds the pet chunk.
    found = await search.by_text("Does Ivan have a dog at work?", limit=10)

    assert found[0].chunk_id == "personal:about-me-personal:3"


async def test_more_matching_words_rank_higher(search: PostgresChunkSearch) -> None:
    found = await search.by_text("phone number validation for SCSS", limit=10)

    assert [c.chunk_id for c in found] == [
        "github_readme:numbers-validator:0",
        "cv:brainrocket:0",
    ]


async def test_text_search_accepts_any_user_input(search: PostgresChunkSearch) -> None:
    # plainto_tsquery drops every operator, so no input raises a tsquery syntax error.
    for question in ['"full-text search" -corgi', "BEM or SCSS", "):( & | ! <->", "", "the a"]:
        await search.by_text(question, limit=10)


async def test_hybrid_retrieval_puts_the_chunk_both_searches_found_first(
    search: PostgresChunkSearch,
) -> None:
    # The vector search points at the ADR chunk; the words point at it too.
    params = RetrievalParams(candidates=4, top_k=3, max_per_project=1, rrf_k=60)
    retriever = HybridRetriever(search, AxisEmbeddings(3), params)

    result = await retriever.retrieve("How does hybrid search work?")

    assert result[0].chunk.chunk_id == "site_docs:0003-vector-database:0"
    assert result[0].score == pytest.approx(1.0)
    assert len(result) == 3
