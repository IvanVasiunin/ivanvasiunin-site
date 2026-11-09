"""The relevance gate: answer only when something retrieved is close to the question (ROADMAP 4.3).

ADR-0004 layer 3.

Retrieval always returns its best chunks, even for a question nothing in the corpus is about
("Did Ivan work at Google?"). Without a gate, the answer model would get unrelated context and
might fill the gap from its own knowledge. With it, such a question gets the "no information"
template (SPEC §5.2), and the answer model is never called.

The gate reads the vector search's cosine similarity, not the fused RRF score: RRF uses only
ranks, so the first chunk scores high whether or not it is relevant. Similarity is absolute: an
unrelated question stays far from every chunk. The threshold is config; evals calibrate it
(ROADMAP 4.5).

Known limits, to measure in the evals (ROADMAP 4.5) before tuning anything:
- a chunk only the full-text search found has no similarity, so an exact rare term with a low
  vector similarity ("NumbersValidator?") can still get "no information";
- the gate sees the chunks retrieval keeps (after fusion, per-project dedup and `top_k`), i.e.
  what the answer model would read, not every vector candidate.
"""

from collections.abc import Sequence

from site_api.rag.retrieval import RetrievedChunk


def best_similarity(chunks: Sequence[RetrievedChunk]) -> float | None:
    """The highest cosine similarity among the chunks, or `None` when none has one."""
    similarities = [item.chunk.similarity for item in chunks if item.chunk.similarity is not None]
    return max(similarities, default=None)


def passes_relevance_gate(chunks: Sequence[RetrievedChunk], min_similarity: float) -> bool:
    """Whether the closest chunk is at least `min_similarity` close to the question."""
    best = best_similarity(chunks)
    return best is not None and best >= min_similarity
