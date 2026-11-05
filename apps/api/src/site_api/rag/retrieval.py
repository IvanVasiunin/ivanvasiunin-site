"""Hybrid retrieval: vector search + full-text search, fused with RRF, deduplicated per project.

Why both searches: the vector search finds paraphrases and other languages ("¿Dónde trabaja
Iván?" finds the BrainRocket chunk), the full-text search finds exact names and rare terms
("BEM", "NumbersValidator") that embeddings blur. RRF (`fusion.py`) merges the two rankings.

Why deduplicate: one project can have many similar chunks (CV entry, README sections). Keeping
at most `max_per_project` of them leaves room in the answer's context for other sources.
"""

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

    @classmethod
    def from_settings(cls, settings: Settings) -> "RetrievalParams":
        """Read the `retrieval_*` settings."""
        return cls(
            candidates=settings.retrieval_candidates,
            top_k=settings.retrieval_top_k,
            max_per_project=settings.retrieval_max_per_project,
            rrf_k=settings.retrieval_rrf_k,
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
        candidates = {chunk.chunk_id: chunk for chunk in [*by_vector, *by_text]}
        scores = reciprocal_rank_fusion(
            [[c.chunk_id for c in by_vector], [c.chunk_id for c in by_text]], self._params.rrf_k
        )
        ranked = [RetrievedChunk(candidates[chunk_id], score) for chunk_id, score in scores.items()]
        return limit_per_project(ranked, self._params.max_per_project)[: self._params.top_k]


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
