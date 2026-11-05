"""Fakes for the ingestion sync: an in-memory chunk store and counting embeddings."""

from collections.abc import Collection, Sequence

import pytest
from langchain_core.embeddings import Embeddings
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.core.config import Settings
from site_api.ingestion.store import ChunkRow, StoredVector

# Small vectors keep the fakes readable; the sync is told to expect this size.
FAKE_DIMENSIONS = 3


class IsolatedSettings(Settings):
    """Settings that never read the developer's real `.env` (only explicit values and the env)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")


class FakeStore:
    """A `ChunkStore` in memory that counts `apply` calls."""

    def __init__(self) -> None:
        self.rows: dict[str, ChunkRow] = {}
        self.vectors: dict[str, StoredVector] = {}
        self.apply_calls = 0

    def load_rows(self) -> dict[str, ChunkRow]:
        return dict(self.rows)

    def embedding_dimensions(self) -> int:
        return FAKE_DIMENSIONS

    def load_vectors(self, hashes: Collection[str]) -> dict[str, StoredVector]:
        return {
            row.content_hash: self.vectors[row.id]
            for row in self.rows.values()
            if row.content_hash in hashes
        }

    def apply(
        self, upserts: Sequence[tuple[ChunkRow, StoredVector]], delete_ids: Collection[str]
    ) -> None:
        self.apply_calls += 1
        for row, vector in upserts:
            self.rows[row.id] = row
            self.vectors[row.id] = vector
        for chunk_id in delete_ids:
            del self.rows[chunk_id]
            del self.vectors[chunk_id]


class FakeEmbeddings(Embeddings):
    """Records every text it is asked to embed; never calls an API."""

    def __init__(self, dimensions: int = FAKE_DIMENSIONS) -> None:
        self.dimensions = dimensions
        self.calls: list[list[str]] = []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [[float(len(text))] + [0.0] * (self.dimensions - 1) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        raise NotImplementedError("ingestion embeds documents only")

    @property
    def embedded_texts(self) -> list[str]:
        """Every text embedded so far, over all calls."""
        return [text for call in self.calls for text in call]


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def embeddings() -> FakeEmbeddings:
    return FakeEmbeddings()


@pytest.fixture
def settings() -> Settings:
    return IsolatedSettings(
        database_url=SecretStr("postgresql+psycopg://site@127.0.0.1:1/site"),
        openai_api_key=None,
        embedding_dimensions=FAKE_DIMENSIONS,
    )
