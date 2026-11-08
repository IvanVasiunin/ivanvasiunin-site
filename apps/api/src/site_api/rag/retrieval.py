"""Hybrid retrieval: vector search + full-text search, fused with RRF, deduplicated per project.

Why both searches: the vector search finds paraphrases and other languages ("¿Dónde trabaja
Iván?" finds the BrainRocket chunk), the full-text search finds exact names and rare terms
("BEM", "NumbersValidator") that embeddings blur. RRF (`fusion.py`) merges the two rankings.

Why deduplicate: one project can have many similar chunks (CV entry, README sections). Keeping
at most `max_per_project` of them leaves room in the answer's context for other sources.

Why several queries (`retrieve_many`, 2026-11-08): the router writes one query per requirement of
a job description or per part of a question. Fusing them into one ranking would again favour the
chunks that match many requirements a little; taking the best chunks of each query in turn gives
every requirement its own sources.
"""

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass

from langchain_core.embeddings import Embeddings

from site_api.core.config import Settings
from site_api.rag.fusion import reciprocal_rank_fusion
from site_api.rag.search import Candidate, ChunkSearch


@dataclass(frozen=True)
class RetrievedChunk:
    """A chunk chosen for the answer, with its fused 0..1 relevance score."""

    chunk: Candidate
    score: float


@dataclass(frozen=True)
class RetrievalParams:
    """The retrieval knobs, taken from `Settings` (all values live in config)."""

    candidates: int
    top_k: int
    max_per_project: int
    rrf_k: int
    # Chunks below this share of the best score are dropped (0 keeps all).
    min_relative_score: float = 0.0
    # The ceiling when the router wrote several queries (each still gets up to `top_k`); `None`
    # keeps `top_k`.
    top_k_multi: int | None = None

    @classmethod
    def from_settings(cls, settings: Settings) -> "RetrievalParams":
        """Read the `retrieval_*` settings."""
        return cls(
            candidates=settings.retrieval_candidates,
            top_k=settings.retrieval_top_k,
            top_k_multi=settings.retrieval_top_k_multi,
            max_per_project=settings.retrieval_max_per_project,
            rrf_k=settings.retrieval_rrf_k,
            min_relative_score=settings.retrieval_min_relative_score,
        )


class HybridRetriever:
    """Find the chunks that best answer a question."""

    def __init__(
        self, search: ChunkSearch, embeddings: Embeddings, params: RetrievalParams
    ) -> None:
        """Use these searches, this embedding model (the same as ingestion) and these knobs."""
        self._search = search
        self._embeddings = embeddings
        self._params = params

    async def retrieve(self, question: str) -> list[RetrievedChunk]:
        """The best chunks for the question, best first, at most `top_k`."""
        # The question must be embedded by the same model and size as the chunks (config).
        embedding = await self._embeddings.aembed_query(question)
        by_vector = await self._search.by_vector(embedding, self._params.candidates)
        by_text = await self._search.by_text(question, self._params.candidates)
        # One candidate per chunk; the vector search's copy wins, because it carries the
        # similarity the relevance gate needs (the full-text copy has none).
        candidates = {chunk.chunk_id: chunk for chunk in [*by_text, *by_vector]}
        scores = reciprocal_rank_fusion(
            [[c.chunk_id for c in by_vector], [c.chunk_id for c in by_text]], self._params.rrf_k
        )
        ranked = [RetrievedChunk(candidates[chunk_id], score) for chunk_id, score in scores.items()]
        best = limit_per_project(ranked, self._params.max_per_project)[: self._params.top_k]
        return above_floor(best, self._params.min_relative_score)

    async def retrieve_many(self, queries: Sequence[str]) -> list[RetrievedChunk]:
        """The best chunks for several queries together, best first, at most `top_k_multi`.

        One query is plain `retrieve`. Several run concurrently; their results are merged in turns
        (the best of each query, then the second best of each, ...), so every query is represented.
        """
        if len(queries) <= 1:
            return await self.retrieve(queries[0] if queries else "")
        per_query = await asyncio.gather(*(self.retrieve(query) for query in queries))
        merged = limit_per_project(interleave(per_query), self._params.max_per_project)
        chosen = merged[: self._params.top_k_multi or self._params.top_k]
        # SPEC §4.2: sources are ordered by score; each chunk keeps its score from its own query.
        return sorted(chosen, key=lambda item: item.score, reverse=True)


def interleave(rankings: Sequence[Sequence[RetrievedChunk]]) -> list[RetrievedChunk]:
    """The rankings merged in turns, each chunk once (at its best rank, the first time it comes)."""
    merged: list[RetrievedChunk] = []
    seen: set[str] = set()
    for rank in range(max((len(ranking) for ranking in rankings), default=0)):
        for ranking in rankings:
            if rank < len(ranking) and ranking[rank].chunk.chunk_id not in seen:
                seen.add(ranking[rank].chunk.chunk_id)
                merged.append(ranking[rank])
    return merged


def above_floor(chunks: Sequence[RetrievedChunk], share: float) -> list[RetrievedChunk]:
    """The chunks scoring at least `share` of the best one (best first, as given).

    RRF gives a chunk found by both searches about twice the score of one found by only one of
    them, so a 0.6 floor drops the tail that only one search liked when the head was liked by both.
    """
    if not chunks:
        return []
    floor = chunks[0].score * share
    return [chunk for chunk in chunks if chunk.score >= floor]


def limit_per_project(
    chunks: Sequence[RetrievedChunk], max_per_project: int
) -> list[RetrievedChunk]:
    """Keep at most `max_per_project` chunks of each project, in the given order.

    Chunks without a project (experience notes, personal facts, site docs) are not limited: they
    are different facts, not variations of one project description.
    """
    kept: list[RetrievedChunk] = []
    per_project: dict[str, int] = {}
    for item in chunks:
        project = item.chunk.project
        if project is not None:
            if per_project.get(project, 0) >= max_per_project:
                continue
            per_project[project] = per_project.get(project, 0) + 1
        kept.append(item)
    return kept
