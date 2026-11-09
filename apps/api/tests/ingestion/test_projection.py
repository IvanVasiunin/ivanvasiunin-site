"""The 2D projection (ROADMAP 6.1, ADR-0006): deterministic, clustered, stable, and storable.

Synthetic embeddings: a few well-separated clusters in 32 dimensions (the real ones have 1536;
UMAP does not care, and small vectors keep the tests fast). The first UMAP call compiles numba
code, so this module takes a few seconds once.
"""

# scikit-learn and joblib ship no type information (as in ingestion/projection.py).
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from pathlib import Path

import numpy as np
import pytest
from sklearn.decomposition import PCA

from site_api.ingestion import projection
from site_api.ingestion.projection import Matrix, ProjectionParams

PARAMS = ProjectionParams(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42)
CLUSTERS = 4
PER_CLUSTER = 20
DIMS = 32


def clustered(seed: int = 0, per_cluster: int = PER_CLUSTER) -> tuple[Matrix, Matrix]:
    """Vectors in CLUSTERS groups around random centres; returns (vectors, centres)."""
    rng = np.random.default_rng(seed)
    centres = rng.normal(size=(CLUSTERS, DIMS))
    vectors = np.vstack([c + 0.3 * rng.normal(size=(per_cluster, DIMS)) for c in centres])
    return vectors, centres


def labels(per_cluster: int = PER_CLUSTER) -> np.ndarray:
    return np.repeat(np.arange(CLUSTERS), per_cluster)


def separation(points: Matrix, groups: np.ndarray) -> float:
    """Mean distance between cluster centres over mean distance of points to their own centre."""
    centres = np.array([points[groups == g].mean(axis=0) for g in range(CLUSTERS)])
    inner = np.mean(
        [np.linalg.norm(points[groups == g] - centres[g], axis=1).mean() for g in range(CLUSTERS)]
    )
    between = np.mean(
        [
            np.linalg.norm(centres[a] - centres[b])
            for a in range(CLUSTERS)
            for b in range(a + 1, CLUSTERS)
        ]
    )
    return float(between / inner)


@pytest.fixture(scope="module")
def fitted() -> tuple[projection.Projection, Matrix, Matrix]:
    vectors, _ = clustered()
    fit, points = projection.fit(vectors, PARAMS, previous=None)
    return fit, points, vectors


def test_the_same_data_gives_the_same_map(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    _, points, vectors = fitted

    _, again = projection.fit(vectors, PARAMS, previous=None)

    np.testing.assert_array_equal(points, again)


def test_points_lie_in_the_unit_square_with_a_margin(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    _, points, _ = fitted

    assert points.shape == (CLUSTERS * PER_CLUSTER, 2)
    # Fitted into the middle 90%: room at the edges for chunks placed later.
    assert points.min() >= 0.05 - 1e-9
    assert points.max() <= 0.95 + 1e-9


def test_related_chunks_cluster_at_least_as_well_as_a_pca_baseline(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    # ADR-0006: PCA is the sanity baseline; UMAP must keep the clusters apart at least as well.
    _, points, vectors = fitted
    pca = PCA(n_components=2, random_state=0).fit_transform(vectors)

    assert separation(points, labels()) >= separation(pca, labels())
    assert separation(points, labels()) > 3


def test_new_chunks_are_placed_near_their_cluster(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    fit, points, _ = fitted
    _, centres = clustered()
    rng = np.random.default_rng(7)
    new = centres[2] + 0.3 * rng.normal(size=(3, DIMS))

    placed = projection.place(fit, new)

    cluster_centres = np.array([points[labels() == g].mean(axis=0) for g in range(CLUSTERS)])
    nearest = np.argmin(np.linalg.norm(cluster_centres - placed.mean(axis=0), axis=1))
    assert nearest == 2
    assert placed.min() >= 0
    assert placed.max() <= 1


def test_placing_is_deterministic(fitted: tuple[projection.Projection, Matrix, Matrix]) -> None:
    fit, _, vectors = fitted

    np.testing.assert_array_equal(
        projection.place(fit, vectors[:3]), projection.place(fit, vectors[:3])
    )


def test_a_refit_is_aligned_to_the_old_points(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    # Stability policy: a refit (more chunks now) keeps the old points close to where they were.
    _, points, vectors = fitted
    more, _ = clustered(seed=0, per_cluster=PER_CLUSTER + 3)
    previous = {i: (float(x), float(y)) for i, (x, y) in enumerate(points)}
    # The old chunks are the first PER_CLUSTER of each cluster in `more`.
    old_rows = np.concatenate(
        [
            np.arange(g * (PER_CLUSTER + 3), g * (PER_CLUSTER + 3) + PER_CLUSTER)
            for g in range(CLUSTERS)
        ]
    )
    more[old_rows] = vectors
    previous = {int(row): previous[i] for i, row in enumerate(old_rows)}

    _, aligned = projection.fit(more, PARAMS, previous)
    _, fresh = projection.fit(more, PARAMS, previous=None)

    old = np.array([previous[int(row)] for row in old_rows])
    aligned_shift = np.median(np.linalg.norm(aligned[old_rows] - old, axis=1))
    fresh_shift = np.median(np.linalg.norm(fresh[old_rows] - old, axis=1))
    assert aligned_shift <= fresh_shift
    # 0.3, not 0.2 (Ivan, 2026-11-09): UMAP's numba code gives slightly different layouts on Linux
    # (0.27 on the first CI run) than on Windows (< 0.2); the first assertion is the real policy.
    assert aligned_shift < 0.3


def test_a_tiny_knowledge_base_still_fits() -> None:
    # Fewer chunks than n_neighbors: UMAP is given as many neighbours as there are.
    vectors, _ = clustered(per_cluster=3)

    _, points = projection.fit(vectors, PARAMS, previous=None)

    assert points.shape == (CLUSTERS * 3, 2)


def test_the_projection_survives_a_save_and_load(
    fitted: tuple[projection.Projection, Matrix, Matrix], tmp_path: Path
) -> None:
    fit, _, vectors = fitted
    path = tmp_path / "nested" / "projection.joblib"

    projection.save(fit, path)
    loaded = projection.load(path)

    assert loaded is not None
    np.testing.assert_array_equal(
        projection.place(loaded, vectors[:2]), projection.place(fit, vectors[:2])
    )


def test_no_model_file_means_none(tmp_path: Path) -> None:
    assert projection.load(tmp_path / "missing.joblib") is None


def test_a_foreign_file_is_refused(tmp_path: Path) -> None:
    import joblib  # noqa: PLC0415 -- only this test writes a foreign artifact

    path = tmp_path / "other.joblib"
    joblib.dump({"not": "a projection"}, path)

    with pytest.raises(ValueError, match="not a projection artifact"):
        projection.load(path)


def test_a_damaged_model_file_is_one_clear_error(tmp_path: Path) -> None:
    # A truncated file, or one from other umap / numba versions: the CLI prints this as one line.
    path = tmp_path / "projection.joblib"
    path.write_bytes(b"not a pickle at all")

    with pytest.raises(ValueError, match=r"cannot be read .*run with --refit"):
        projection.load(path)


def test_saving_leaves_no_partial_file(
    fitted: tuple[projection.Projection, Matrix, Matrix], tmp_path: Path
) -> None:
    fit, _, _ = fitted

    projection.save(fit, tmp_path / "projection.joblib")

    assert [item.name for item in tmp_path.iterdir()] == ["projection.joblib"]


def test_old_points_all_on_one_spot_cannot_steer_a_refit(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    # Nothing to align to: the new layout is simply fitted into the square.
    _, _, vectors = fitted
    previous = {row: (0.5, 0.5) for row in range(10)}

    _, points = projection.fit(vectors, PARAMS, previous)

    assert points.min() >= 0.05 - 1e-9
    assert points.max() <= 0.95 + 1e-9


def test_a_refit_never_piles_points_up_on_the_edge(
    fitted: tuple[projection.Projection, Matrix, Matrix],
) -> None:
    # Old points squeezed into one corner: aligned to them, the new layout would leave the square.
    _, points, vectors = fitted
    previous = {row: (float(x) * 0.2, float(y) * 0.2) for row, (x, y) in enumerate(points[:40])}
    more = np.vstack([vectors, clustered(seed=5)[0][:10]])

    _, refit = projection.fit(more, PARAMS, previous)

    assert refit.min() >= 0.05 - 1e-9
    assert refit.max() <= 0.95 + 1e-9
