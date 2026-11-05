"""Idempotent embedding and upsert by content hash (ROADMAP 3.4).

DoD: a re-run without changes makes zero embedding calls (and zero writes).
"""

import hashlib

import pytest
from langchain_core.documents import Document

from site_api.ingestion.store import StoredVector
from site_api.ingestion.sync import apply_sync, content_hash, plan_sync

from .conftest import FAKE_DIMENSIONS, FakeEmbeddings, FakeStore


def chunk(chunk_id: str, text: str, url: str | None = "/cv#job-acme") -> Document:
    return Document(
        page_content=text,
        metadata={
            "chunk_id": chunk_id,
            "doc_id": chunk_id.rsplit(":", 1)[0],
            "source_type": "cv",
            "category": "job",
            "title": "Acme — Dev",
            "section": "Acme — Dev",
            "url": url,
            "source_date": None,
            "project": None,
        },
    )


CHUNKS = [chunk("cv:acme:0", "I build UI."), chunk("cv:acme:1", "I review code.")]


def sync(chunks: list[Document], store: FakeStore, embeddings: FakeEmbeddings) -> None:
    apply_sync(plan_sync(chunks, store), store, embeddings, FAKE_DIMENSIONS)


def test_first_run_embeds_and_writes_every_chunk(
    store: FakeStore, embeddings: FakeEmbeddings
) -> None:
    sync(CHUNKS, store, embeddings)

    assert embeddings.embedded_texts == ["I build UI.", "I review code."]
    assert sorted(store.rows) == ["cv:acme:0", "cv:acme:1"]


def test_rerun_without_changes_makes_no_calls_and_no_writes(
    store: FakeStore, embeddings: FakeEmbeddings
) -> None:
    sync(CHUNKS, store, embeddings)
    embeddings.calls.clear()
    store.apply_calls = 0

    plan = plan_sync(CHUNKS, store)
    apply_sync(plan, store, embeddings, FAKE_DIMENSIONS)

    assert plan.unchanged == 2
    assert not plan.has_changes
    assert embeddings.calls == []
    assert store.apply_calls == 0


def test_changed_text_is_embedded_alone(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    sync(CHUNKS, store, embeddings)
    embeddings.calls.clear()

    sync([CHUNKS[0], chunk("cv:acme:1", "I review code daily.")], store, embeddings)

    assert embeddings.embedded_texts == ["I review code daily."]
    assert store.rows["cv:acme:1"].content == "I review code daily."


def test_metadata_change_rewrites_the_row_without_embedding(
    store: FakeStore, embeddings: FakeEmbeddings
) -> None:
    sync(CHUNKS, store, embeddings)
    embeddings.calls.clear()

    plan = plan_sync([chunk("cv:acme:0", "I build UI.", url="/cv#job-new"), CHUNKS[1]], store)
    apply_sync(plan, store, embeddings, FAKE_DIMENSIONS)

    assert [row.id for row in plan.upserts] == ["cv:acme:0"]
    assert embeddings.calls == []
    assert store.rows["cv:acme:0"].url == "/cv#job-new"


def test_removed_chunks_are_deleted(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    sync(CHUNKS, store, embeddings)

    plan = plan_sync(CHUNKS[:1], store)
    apply_sync(plan, store, embeddings, FAKE_DIMENSIONS)

    assert plan.delete_ids == ["cv:acme:1"]
    assert sorted(store.rows) == ["cv:acme:0"]


def test_shifted_ids_reuse_embeddings_by_hash(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    # A new chunk at the top renumbers the others: their text is known, so no call for them.
    sync(CHUNKS, store, embeddings)
    embeddings.calls.clear()
    shifted = [
        chunk("cv:acme:0", "I lead releases."),
        chunk("cv:acme:1", "I build UI."),
        chunk("cv:acme:2", "I review code."),
    ]

    sync(shifted, store, embeddings)

    assert embeddings.embedded_texts == ["I lead releases."]
    assert store.vectors["cv:acme:2"].embedding == [float(len("I review code.")), 0.0, 0.0]


def test_identical_texts_are_embedded_once(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    sync([chunk("cv:a:0", "Same text."), chunk("cv:b:0", "Same text.")], store, embeddings)

    assert embeddings.embedded_texts == ["Same text."]
    assert store.vectors["cv:a:0"].embedding == store.vectors["cv:b:0"].embedding


def test_duplicate_chunk_ids_fail_before_any_read(store: FakeStore) -> None:
    with pytest.raises(ValueError, match="cv:acme:0"):
        plan_sync([CHUNKS[0], CHUNKS[0]], store)


def test_wrong_embedding_size_writes_nothing(store: FakeStore) -> None:
    with pytest.raises(ValueError, match="3-dimensional"):
        sync(CHUNKS, store, FakeEmbeddings(dimensions=5))

    assert store.rows == {}


def test_content_hash_is_sha256_hex() -> None:
    text = "I build UI."

    assert content_hash(text) == hashlib.sha256(text.encode("utf-8")).hexdigest()
    assert len(content_hash(text)) == 64


def test_estimate_counts_only_texts_to_embed(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    sync(CHUNKS[:1], store, embeddings)

    plan = plan_sync(CHUNKS, store)

    # Only "I review code." (14 characters) is new: ceil(14 / 4) = 4 tokens.
    assert list(plan.to_embed.values()) == ["I review code."]
    assert plan.estimated_tokens() == 4


def test_shifted_ids_keep_their_map_points(store: FakeStore, embeddings: FakeEmbeddings) -> None:
    # ADR-0006: unchanged text keeps its coordinates even when its chunk id changes.
    sync(CHUNKS, store, embeddings)
    store.vectors["cv:acme:1"] = StoredVector(store.vectors["cv:acme:1"].embedding, 0.2, 0.8)

    sync(
        [
            chunk("cv:acme:0", "I lead releases."),
            chunk("cv:acme:1", "I build UI."),
            chunk("cv:acme:2", "I review code."),
        ],
        store,
        embeddings,
    )

    assert (store.vectors["cv:acme:2"].x, store.vectors["cv:acme:2"].y) == (0.2, 0.8)
    assert store.vectors["cv:acme:0"].x is None


def test_size_mismatch_with_the_table_fails_before_any_paid_call(
    store: FakeStore, embeddings: FakeEmbeddings
) -> None:
    with pytest.raises(ValueError, match="the table has 3"):
        apply_sync(plan_sync(CHUNKS, store), store, embeddings, dimensions=1536)

    assert embeddings.calls == []
