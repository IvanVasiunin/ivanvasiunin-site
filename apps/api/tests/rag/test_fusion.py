"""Reciprocal Rank Fusion (ROADMAP 3.6)."""

import pytest

from site_api.rag.fusion import reciprocal_rank_fusion

K = 60


def test_first_in_every_list_scores_one() -> None:
    scores = reciprocal_rank_fusion([["a", "b"], ["a", "c"]], K)

    assert scores["a"] == pytest.approx(1.0)


def test_found_by_both_searches_beats_found_by_one() -> None:
    # "b" is second in both lists, "c" is first but only in one: agreement wins.
    scores = reciprocal_rank_fusion([["c", "b"], ["d", "b"]], K)

    assert next(iter(scores)) == "b"


def test_scores_are_normalized_and_sorted_best_first() -> None:
    scores = reciprocal_rank_fusion([["a", "b", "c"], ["b"]], K)

    values = list(scores.values())
    assert values == sorted(values, reverse=True)
    assert all(0 < value <= 1 for value in values)


def test_score_formula() -> None:
    # One list: rank 2 gives 1 / (k + 2), normalized by the best possible 1 / (k + 1).
    scores = reciprocal_rank_fusion([["a", "b"]], K)

    assert scores["b"] == pytest.approx((1 / (K + 2)) / (1 / (K + 1)))


def test_a_larger_k_flattens_the_ranks() -> None:
    sharp = reciprocal_rank_fusion([["a", "b"]], 1)
    flat = reciprocal_rank_fusion([["a", "b"]], 1000)

    assert sharp["b"] < flat["b"]


def test_empty_input() -> None:
    assert reciprocal_rank_fusion([], K) == {}
    assert reciprocal_rank_fusion([[], []], K) == {}
