"""Reciprocal Rank Fusion: merge rankings from different searches into one (ROADMAP 3.6).

A vector search and a full-text search score in different units (cosine distance vs `ts_rank`),
so their scores cannot be added. RRF uses only each chunk's *rank* in each list:

    rrf(chunk) = Σ over lists of 1 / (k + rank),   rank starting at 1.

A chunk near the top of both lists beats one that only one search found. The SSE `sources`
event wants a 0..1 score (SPEC §4.2), so the sum is divided by its maximum: first place in every
list, `len(rankings) / (k + 1)`.
"""

from collections.abc import Sequence


def reciprocal_rank_fusion(rankings: Sequence[Sequence[str]], k: int) -> dict[str, float]:
    """Fuse ranked id lists (best first) into normalized 0..1 scores, best first.

    Args:
        rankings: one list of chunk ids per search, each ordered best first.
        k: the RRF constant; larger values flatten the difference between ranks.
    """
    if not rankings:
        return {}
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1 / (k + rank)
    best_possible = len(rankings) / (k + 1)
    normalized = {chunk_id: score / best_possible for chunk_id, score in scores.items()}
    # Ties keep the order of first appearance (dicts keep insertion order; sorted is stable).
    return dict(sorted(normalized.items(), key=lambda item: item[1], reverse=True))
