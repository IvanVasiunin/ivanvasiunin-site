"""The 2D map of the knowledge base (ROADMAP 6.1, ADR-0006): chunk embeddings → points in 0..1.

UMAP turns each 1536-dimension embedding into a point on a plane, so that chunks about the same
thing land near each other. The map lives behind the chat (SPEC US-A11) and must stay put when the
content changes a little, so the policy is:

1. A chunk that already has a point keeps it (the sync reuses points by content hash).
2. New or changed chunks are *placed* with the stored fitted model (`transform`), which leaves
   every other point where it was.
3. A full *refit* happens on the first run, on `--refit`, or when the model file is lost. Its new
   layout is then rotated, scaled and shifted to match the old points as closely as possible
   (Procrustes alignment). Checked on 240 synthetic chunks in 5 clusters (2026-11-06): a refit
   moves the median point by 50% of the map's span, 36% with UMAP's `init=` old coordinates, 15%
   with the alignment and no `init=` (which then adds nothing), so the alignment is what is used.

Everything here is CPU work for ingestion only; the API never imports this module (numba is heavy).
"""

# umap-learn and joblib ship no type information: their calls are untyped (ADR-0006).
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import umap
from numpy.typing import NDArray
from scipy.linalg import orthogonal_procrustes

from site_api.core.config import Settings

type Matrix = NDArray[np.float64]

# The fitted layout fills this share of the 0..1 square; the margin leaves room for chunks placed
# later just outside the old points (anything further out is clipped to the edge).
FILL = 0.9
# Fewer old points than this cannot fix a rotation and a scale: the new layout is fitted fresh.
MIN_ALIGN_POINTS = 3


@dataclass(frozen=True)
class ProjectionParams:
    """UMAP's settings (config, ADR-0006)."""

    n_neighbors: int
    min_dist: float
    metric: str
    random_state: int

    @classmethod
    def from_settings(cls, settings: Settings) -> "ProjectionParams":
        """The values from config."""
        return cls(
            n_neighbors=settings.projection_n_neighbors,
            min_dist=settings.projection_min_dist,
            metric=settings.projection_metric,
            random_state=settings.projection_random_state,
        )


@dataclass(frozen=True)
class Projection:
    """A fitted UMAP model and the affine map from its raw output to the 0..1 square.

    `point = clip(raw @ matrix + offset, 0, 1)`. Keeping the affine map with the model means a
    chunk placed months later lands in the same coordinates as the old points around it.
    """

    model: umap.UMAP
    matrix: Matrix
    offset: Matrix

    def to_unit(self, raw: Matrix) -> Matrix:
        """Raw UMAP coordinates → points in 0..1."""
        return np.clip(raw @ self.matrix + self.offset, 0.0, 1.0)


def as_matrix(vectors: Sequence[Sequence[float]]) -> Matrix:
    """Embeddings as a float64 matrix, one row per chunk."""
    return np.asarray(vectors, dtype=np.float64)


def _fit_model(vectors: Matrix, params: ProjectionParams) -> tuple[umap.UMAP, Matrix]:
    """Fit UMAP on all vectors; returns the model and its raw 2D output."""
    # `n_neighbors` cannot exceed the number of other points; a tiny base (tests, a new site) gets
    # as many as it has. `random_state` makes the layout deterministic (and single-threaded,
    # which is fine for hundreds of points).
    model = umap.UMAP(
        n_neighbors=min(params.n_neighbors, len(vectors) - 1),
        min_dist=params.min_dist,
        metric=params.metric,
        random_state=params.random_state,
        # One thread: a fixed random_state needs it anyway (UMAP warns when it has to override).
        n_jobs=1,
    )
    raw = np.asarray(model.fit_transform(vectors), dtype=np.float64)
    return model, raw


def _fit_square(raw: Matrix) -> tuple[Matrix, Matrix]:
    """The affine map that fits these raw points into the middle FILL of the 0..1 square."""
    low, high = raw.min(axis=0), raw.max(axis=0)
    # One scale for both axes keeps the clusters' shapes; the layout is centred.
    span = float(max((high - low).max(), 1e-9))
    scale = FILL / span
    centre = (low + high) / 2
    matrix = np.eye(2) * scale
    offset = 0.5 - centre * scale
    return matrix, offset


class _CannotAlign(Exception):
    """The old points (or their new positions) have no spread to align to."""


def _alignment(new: Matrix, old: Matrix) -> tuple[Matrix, Matrix]:
    """The rotation, reflection, uniform scale and shift that bring `new` closest to `old`.

    Orthogonal Procrustes: both are the same points in the same order; returns (matrix, offset)
    with `new @ matrix + offset ≈ old`.
    """
    new_mean, old_mean = new.mean(axis=0), old.mean(axis=0)
    centred = new - new_mean
    spread = float((centred**2).sum())
    if spread <= 0 or float(((old - old_mean) ** 2).sum()) <= 0:
        # All on one spot: no rotation or scale to recover. Fit into the square instead.
        raise _CannotAlign
    # `orthogonal_procrustes(a, b)` returns the orthogonal R minimizing |aR - b| and the sum of
    # singular values, from which the best uniform scale follows.
    rotation, singular_sum = orthogonal_procrustes(centred, old - old_mean)
    scale = float(singular_sum) / spread
    matrix = np.asarray(rotation, dtype=np.float64) * scale
    return matrix, old_mean - new_mean @ matrix


def fit(
    vectors: Matrix, params: ProjectionParams, previous: Mapping[int, tuple[float, float]] | None
) -> tuple[Projection, Matrix]:
    """Fit a new map; returns the projection and every vector's point in 0..1.

    Args:
        vectors: one embedding per row.
        params: UMAP's settings.
        previous: old points by row index; with at least MIN_ALIGN_POINTS of them, the new layout
            is aligned to them (a refit), otherwise it is simply fitted into the square.
    """
    model, raw = _fit_model(vectors, params)
    matrix, offset = _fit_square(raw)
    if previous is not None and len(previous) >= MIN_ALIGN_POINTS:
        rows = sorted(previous)
        try:
            matrix, offset = _alignment(raw[rows], np.asarray([previous[row] for row in rows]))
        except _CannotAlign:
            pass
        else:
            matrix, offset = _keep_in_square(raw @ matrix + offset, matrix, offset)
    projection = Projection(model=model, matrix=matrix, offset=offset)
    return projection, projection.to_unit(raw)


def _keep_in_square(aligned: Matrix, matrix: Matrix, offset: Matrix) -> tuple[Matrix, Matrix]:
    """Shrink an aligned layout that reaches past the square back into its middle FILL.

    The alignment follows the old points, so new ones can land outside 0..1, where clipping would
    pile them up on the edge. Shrinking keeps the rotation and the relative positions; it moves
    the whole map a little, which is the lesser evil.
    """
    low, high = aligned.min(axis=0), aligned.max(axis=0)
    margin = (1 - FILL) / 2
    if low.min() >= margin and high.max() <= 1 - margin:
        return matrix, offset
    fit_matrix, fit_offset = _fit_square(aligned)
    return matrix @ fit_matrix, offset @ fit_matrix + fit_offset


def place(projection: Projection, vectors: Matrix) -> Matrix:
    """Points for new chunks on the existing map; every other point stays where it is."""
    raw = np.asarray(projection.model.transform(vectors), dtype=np.float64)
    return projection.to_unit(raw)


def save(projection: Projection, path: Path) -> None:
    """Store the fitted projection (model and affine map) for later runs.

    Written to a temporary file first and then renamed over the old one, so an interrupted run
    never leaves a half-written model behind.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.partial")
    joblib.dump(projection, partial)
    partial.replace(path)


def load(path: Path) -> Projection | None:
    """The stored projection, or None when there is none yet (then the next run refits).

    joblib unpickles: only ever load this repository's own artifact, never a downloaded file.
    """
    if not path.is_file():
        return None
    try:
        loaded: object = joblib.load(path)
    except Exception as error:
        # A damaged file, or one written by other umap / numba versions: unpickling fails in many
        # ways. The cure is the same; the CLI prints it as one line.
        raise ValueError(
            f"{path} cannot be read ({type(error).__name__}): {_REFIT_HINT}"
        ) from error
    if not isinstance(loaded, Projection):
        raise ValueError(f"{path} is not a projection artifact: {_REFIT_HINT}")
    return loaded


_REFIT_HINT = "delete it and run with --refit"
