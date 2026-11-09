"""Bring the `chunks` table in line with the current chunks, embedding only new text (ROADMAP 3.4).

Two phases, so the paid part can be estimated first (CLAUDE.md golden rule 13):
1. `plan_sync` compares the planned rows with the stored ones. It reads the database and calls
   no API.
2. `apply_sync` embeds the texts nobody has embedded before and writes the changes.

Embeddings are matched by content hash, not by chunk id: a chunk whose id shifted (text was added
above it) or that moved to another document reuses its stored embedding. A re-run without
changes plans zero embeddings and zero writes.
"""

import hashlib
import math
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from site_api.ingestion.store import ChunkRow, ChunkStore, StoredVector

# A rough token count for the cost estimate: English text averages ~4 characters per token.
CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class SyncPlan:
    """What a sync would do. Built without any paid call."""

    unchanged: int
    # Rows to insert or update (new, changed text, or changed metadata).
    upserts: list[ChunkRow] = field(default_factory=list[ChunkRow])
    # Stored embeddings and map points that changed rows can reuse, by content hash.
    reused: dict[str, StoredVector] = field(default_factory=dict[str, StoredVector])
    # Texts that need an embedding call, by content hash (one call per distinct text).
    to_embed: dict[str, str] = field(default_factory=dict[str, str])
    delete_ids: list[str] = field(default_factory=list[str])

    @property
    def has_changes(self) -> bool:
        """Whether applying the plan would write anything."""
        return bool(self.upserts or self.delete_ids)

    def estimated_tokens(self) -> int:
        """Approximate input tokens of the embedding calls."""
        return math.ceil(sum(len(text) for text in self.to_embed.values()) / CHARS_PER_TOKEN)


def content_hash(text: str) -> str:
    """SHA-256 of the chunk text, as 64 hex characters (the `ck_chunks_content_hash` format)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def to_row(chunk: Document) -> ChunkRow:
    """The table row of one chunk from `chunking.py`."""
    meta = chunk.metadata
    return ChunkRow(
        id=meta["chunk_id"],
        content=chunk.page_content,
        source_type=meta["source_type"],
        category=meta["category"],
        section=meta["section"],
        project=meta["project"],
        url=meta["url"],
        source_date=meta["source_date"],
        content_hash=content_hash(chunk.page_content),
    )


def plan_sync(chunks: list[Document], store: ChunkStore) -> SyncPlan:
    """Compare the chunks with the stored rows and decide what to write, embed and delete."""
    rows = [to_row(chunk) for chunk in chunks]
    ensure_unique_ids(rows)
    stored = store.load_rows()
    upserts = [row for row in rows if stored.get(row.id) != row]
    reused = store.load_vectors({row.content_hash for row in upserts})
    to_embed = {row.content_hash: row.content for row in upserts if row.content_hash not in reused}
    planned_ids = {row.id for row in rows}
    return SyncPlan(
        unchanged=len(rows) - len(upserts),
        upserts=upserts,
        reused=reused,
        to_embed=to_embed,
        delete_ids=sorted(set(stored) - planned_ids),
    )


def apply_sync(plan: SyncPlan, store: ChunkStore, embeddings: Embeddings, dimensions: int) -> None:
    """Embed the new texts, then write and delete rows in one transaction.

    Args:
        plan: the result of `plan_sync`.
        store: where the rows are written.
        embeddings: the embedding model; called only for texts in `plan.to_embed`.
        dimensions: the configured embedding size; it must match the stored column.

    Raises:
        ValueError: the configured size differs from the column (checked before the paid call),
            or the model returned vectors of another size (checked before anything is written).
    """
    if not plan.has_changes:
        return
    column = store.embedding_dimensions()
    if dimensions != column:
        raise ValueError(f"Configured {dimensions} embedding dimensions, the table has {column}")
    vectors = dict(plan.reused)
    if plan.to_embed:
        hashes = list(plan.to_embed)
        # One batched call for all new texts; LangChain splits it into API-sized requests.
        new_vectors = embeddings.embed_documents([plan.to_embed[key] for key in hashes])
        check_dimensions(new_vectors, dimensions)
        vectors.update(
            (key, StoredVector(vector)) for key, vector in zip(hashes, new_vectors, strict=True)
        )
    store.apply([(row, vectors[row.content_hash]) for row in plan.upserts], plan.delete_ids)


def ensure_unique_ids(rows: list[ChunkRow]) -> None:
    """Fail before any write if two chunks share an id (the second would overwrite the first)."""
    counts = Counter(row.id for row in rows)
    duplicates = sorted(chunk_id for chunk_id, count in counts.items() if count > 1)
    if duplicates:
        raise ValueError(f"Duplicate chunk ids: {', '.join(duplicates)}")


def check_dimensions(vectors: Iterable[list[float]], dimensions: int) -> None:
    """Every vector must have the configured size (`vector(1536)` in the table)."""
    sizes = {len(vector) for vector in vectors}
    if sizes - {dimensions}:
        raise ValueError(f"Expected {dimensions}-dimensional embeddings, got sizes {sorted(sizes)}")
