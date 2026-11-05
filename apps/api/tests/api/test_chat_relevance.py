"""The relevance gate (ROADMAP 4.3, ADR-0004 layer 3, SPEC §5.2).

When nothing retrieved is close to the question, Elio answers with the "no information" template
and the answer model is never called. The gate reads the vector search's cosine similarity.
"""

import pytest
from httpx import AsyncClient

from site_api.prompts.localized import template_answer
from site_api.rag.relevance import best_similarity, passes_relevance_gate
from site_api.rag.retrieval import HybridRetriever, RetrievalParams, RetrievedChunk
from site_api.rag.search import Candidate

from .chat_fakes import FakeRetriever, routing
from .conftest import Chat, body, events_of


def chunk(chunk_id: str, similarity: float | None) -> RetrievedChunk:
    candidate = Candidate(
        chunk_id=chunk_id,
        content=f"Text of {chunk_id}.",
        source_type="cv",
        category="job",
        section="Section",
        project=None,
        url=None,
        similarity=similarity,
    )
    return RetrievedChunk(candidate, score=0.9)


# ── The gate on its own ───────────────────────────────────────────────────────────────────────


def test_the_closest_chunk_decides() -> None:
    chunks = [chunk("a", 0.21), chunk("b", 0.44), chunk("c", None)]

    assert best_similarity(chunks) == pytest.approx(0.44)
    assert passes_relevance_gate(chunks, min_similarity=0.3)
    assert not passes_relevance_gate(chunks, min_similarity=0.5)


def test_the_threshold_itself_passes() -> None:
    assert passes_relevance_gate([chunk("a", 0.3)], min_similarity=0.3)


def test_no_chunks_or_no_similarity_never_pass() -> None:
    # A chunk only the full-text search found has no similarity: on its own it proves nothing.
    assert not passes_relevance_gate([], min_similarity=0.0)
    assert not passes_relevance_gate([chunk("a", None)], min_similarity=0.0)


# ── In the chat stream ────────────────────────────────────────────────────────────────────────


async def test_an_unrelated_question_gets_no_information_without_the_answer_model(
    client: AsyncClient, chat: Chat
) -> None:
    # "Did Ivan work at Google?": retrieval still returns its best chunks, but none is close.
    chat.retriever = FakeRetriever(chunks=[chunk("cv:far:0", 0.12), chunk("cv:far:1", 0.08)])

    response = await client.post("/api/chat", json=body("Did Ivan work at Google?"))
    events = events_of(response)

    assert [event["type"] for event in events] == ["route", "sources", "token", "usage", "done"]
    assert events[1] == {"type": "sources", "items": []}
    assert events[2]["text"] == template_answer("no_info", "en")
    assert events[-1]["finish_reason"] == "no_info"
    assert chat.model.received == []


async def test_no_information_comes_in_the_questions_language(
    client: AsyncClient, chat: Chat
) -> None:
    chat.router = routing("about_ivan", "ru")
    chat.retriever = FakeRetriever(chunks=[chunk("cv:far:0", 0.1)])

    events = events_of(await client.post("/api/chat", json=body("Иван работал в Google?")))

    assert events[2]["text"] == template_answer("no_info", "ru")


async def test_no_information_costs_only_the_router(client: AsyncClient, chat: Chat) -> None:
    chat.retriever = FakeRetriever(chunks=[chunk("cv:far:0", 0.1)])

    events = events_of(await client.post("/api/chat", json=body()))

    (usage,) = [event for event in events if event["type"] == "usage"]
    assert usage["estimated_cost_usd"] == pytest.approx(0.000046)
    assert chat.spend.spent_usd == pytest.approx(0.000046)


async def test_the_no_information_answer_offers_ivans_contacts(client: AsyncClient) -> None:
    # SPEC §5.2: "You can ask Ivan directly: <contacts>" — the public ones of SPEC §3.2 only.
    for language in ("en", "es", "ru", "uk"):
        text = template_answer("no_info", language)
        assert "mailto:ivanvasyunin@gmail.com" in text
        assert "https://t.me/IvanVasiunin" in text
        assert "https://www.linkedin.com/in/ivan-vasiunin-9967a5132/" in text


# ── Retrieval keeps the similarity ────────────────────────────────────────────────────────────


class _Search:
    """Both searches find the same chunk; only the vector copy carries a similarity."""

    async def by_vector(self, embedding: list[float], limit: int) -> list[Candidate]:
        return [chunk("cv:a:0", 0.55).chunk]

    async def by_text(self, question: str, limit: int) -> list[Candidate]:
        return [chunk("cv:a:0", None).chunk]


class _Embeddings:
    async def aembed_query(self, text: str) -> list[float]:
        return [1.0, 0.0]


async def test_a_chunk_both_searches_found_keeps_the_vector_similarity() -> None:
    retriever = HybridRetriever(
        _Search(),
        _Embeddings(),  # pyright: ignore[reportArgumentType] -- only aembed_query is used
        RetrievalParams(candidates=5, top_k=5, max_per_project=2, rrf_k=60),
    )

    (found,) = await retriever.retrieve("What does Ivan do?")

    assert found.chunk.similarity == pytest.approx(0.55)
