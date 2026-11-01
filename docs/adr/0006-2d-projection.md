# ADR-0006: 2D projection of embeddings

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

Each chunk has a 1536-dimension embedding. The visualization needs 2D coordinates that:
- show meaningful clusters (CV vs personal vs site docs, etc.);
- are **deterministic**: the same data gives the same layout;
- stay **stable** when a few chunks are added or changed, so the map does not reshuffle after every content edit.

Coordinates are computed at ingestion, not in the browser.

## Options

| Method | Cluster quality | Deterministic | Adding points | Notes |
|---|---|---|---|---|
| PCA (scikit-learn) | Weak: a linear projection blurs clusters | Yes | Trivial: `transform()` with the fitted model | Good baseline and sanity check |
| **UMAP (umap-learn 0.5.12)** | Good local and global structure | Yes with a fixed `random_state` (disables parallelism, which is fine for hundreds of points) | `transform()` on a fitted model; or refit with `init=` previous coordinates | Pulls in numba / pynndescent (ingestion only) |
| t-SNE | Good local clusters | With a fixed seed | No `transform()`; a full refit reshuffles the layout | Rejected |

## Decision

- **UMAP** with fixed parameters in config:
  - `random_state=42`;
  - `metric="cosine"`;
  - `n_neighbors=15`;
  - `min_dist=0.1`.

  These are starting values, tuned at the decision gate.
- **PCA** is computed in tests as a baseline and sanity check.
- Coordinates are normalized to 0..1, stored in `chunks.x` / `chunks.y` and exported to `points.json`.
- **Stability policy:**
  1. Unchanged chunks (same `content_hash`) keep their stored coordinates.
  2. New or changed chunks are placed with `transform()` of the persisted fitted UMAP model (a `joblib` artifact stored with the ingestion output, not in git).
  3. A **full refit** happens only on an explicit `--refit` flag. It uses `init=` the previous coordinates (new points initialized near their nearest neighbours) to minimize visual jumps.

  The `transform()` and `init=` behaviour of umap-learn 0.5.12 is UNVERIFIED and is checked in Phase 6.

## Consequences

- The map stays visually stable across routine content edits.
- **Model artifact:** the fitted model must be stored and versioned with the data, and losing it forces a refit. This is documented in the [RUNBOOK](../RUNBOOK.md).
- **numba** is a heavy dependency. It is kept out of the API's runtime import path: the projection is imported only by ingestion.
- **Mentor zone:** Ivan implements this himself ([ADR-0007](0007-mentor-mode.md)).
