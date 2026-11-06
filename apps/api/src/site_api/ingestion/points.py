"""Points on the 2D map: give every chunk one, store them, export `points.json` (ROADMAP 6.1).

Runs after the sync (`--apply`): chunks whose text is new have no point yet (the sync reuses the
points of unchanged texts by content hash). They are placed on the existing map, or the whole map
is fitted when there is no model yet or `--refit` asks for it (projection.py has the policy).
Then the browser's copy, `points.json` (SPEC §4.4), is written: ids, coordinates, source types and
sections only, never chunk text.
"""

import datetime
import gzip
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from site_api.core.config import Settings
from site_api.schemas.chat import SourceType

# SPEC §4.4 and the budget in CLAUDE.md: points.json is at most 50 KB gzipped.
MAX_POINTS_GZIP_BYTES = 50 * 1024
# Four decimals place a point to 1/10000 of the map: far finer than a screen, and half the bytes.
DECIMALS = 4


@dataclass(frozen=True)
class PointRow:
    """A chunk as the map sees it: its id, kind, section, embedding and point (None: not placed)."""

    id: str
    source_type: SourceType
    section: str
    embedding: list[float]
    x: float | None
    y: float | None


class PointStore(Protocol):
    """What the map step needs from storage."""

    def load_points(self) -> list[PointRow]:
        """Every chunk, ordered by id."""
        ...

    def save_points(self, points: Mapping[str, tuple[float, float]]) -> None:
        """Write these points (by chunk id) in one transaction."""
        ...


@dataclass(frozen=True)
class MapUpdate:
    """What the map step did."""

    refitted: bool
    placed: int
    total: int


def resolve(path: Path, root: Path) -> Path:
    """A configured path: absolute as given, relative to the repository root otherwise."""
    return path if path.is_absolute() else root / path


def update_points(store: PointStore, settings: Settings, root: Path, refit: bool) -> MapUpdate:
    """Give every chunk a point, store them and the model; returns what was done.

    Raises:
        ValueError: fewer than three chunks (UMAP needs neighbours), or a broken model file.
    """
    # Imported here: UMAP and numba take seconds to load and only this step needs them. The store
    # imports this module for `PointRow`, and nothing else should pay for numba (ADR-0006).
    from site_api.ingestion import projection  # noqa: PLC0415

    rows = store.load_points()
    if not rows:
        return MapUpdate(refitted=False, placed=0, total=0)
    model_path = resolve(settings.projection_model_path, root)
    fitted = None if refit else projection.load(model_path)
    missing = [index for index, row in enumerate(rows) if row.x is None or row.y is None]

    if fitted is not None and not missing:
        return MapUpdate(refitted=False, placed=0, total=len(rows))
    if fitted is not None:
        placed = projection.place(
            fitted, projection.as_matrix([rows[i].embedding for i in missing])
        )
        store.save_points({rows[i].id: _point(xy) for i, xy in zip(missing, placed, strict=True)})
        return MapUpdate(refitted=False, placed=len(missing), total=len(rows))

    # UMAP needs neighbours. (A base this small with a lost model file cannot be re-exported
    # either; a real knowledge base has hundreds of chunks.)
    if len(rows) < projection.MIN_ALIGN_POINTS:
        raise ValueError(f"the map needs at least {projection.MIN_ALIGN_POINTS} chunks")
    # A full fit: the first run, --refit, or a lost model file. Old points, if any, steer the new
    # layout so the map moves as little as possible.
    previous = {
        index: (row.x, row.y)
        for index, row in enumerate(rows)
        if row.x is not None and row.y is not None
    }
    fitted, points = projection.fit(
        projection.as_matrix([row.embedding for row in rows]),
        projection.ProjectionParams.from_settings(settings),
        previous,
    )
    # The points first, then the model: if writing the points fails, the old model still matches
    # the stored points; a lost model only means an aligned refit next time.
    store.save_points({row.id: _point(xy) for row, xy in zip(rows, points, strict=True)})
    projection.save(fitted, model_path)
    return MapUpdate(refitted=True, placed=len(rows), total=len(rows))


def _point(xy: Sequence[float]) -> tuple[float, float]:
    """One point, rounded as it is stored and exported."""
    return (round(float(xy[0]), DECIMALS), round(float(xy[1]), DECIMALS))


def points_document(rows: Sequence[PointRow], version: datetime.datetime) -> dict[str, object]:
    """The `points.json` content (SPEC §4.4): only placed chunks, and no chunk text.

    `version` is the time of the run, so every `--apply` gives the browser a new version to fetch.
    """
    return {
        "version": version.isoformat().replace("+00:00", "Z"),
        "points": [
            {
                "id": row.id,
                "x": round(row.x, DECIMALS),
                "y": round(row.y, DECIMALS),
                "source_type": row.source_type,
                "section": row.section,
            }
            for row in rows
            if row.x is not None and row.y is not None
        ],
    }


def write_points(document: Mapping[str, object], path: Path) -> int:
    """Write `points.json` compactly; returns its gzipped size.

    Raises:
        ValueError: it would exceed the 50 KB gzip budget (nothing is written).
    """
    data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    size = len(gzip.compress(data))
    if size > MAX_POINTS_GZIP_BYTES:
        raise ValueError(f"points.json would be {size} bytes gzipped, over the 50 KB budget")
    path.parent.mkdir(parents=True, exist_ok=True)
    # Renamed into place: a reader (Caddy serving the file) never sees a half-written one.
    partial = path.with_name(f"{path.name}.partial")
    partial.write_bytes(data)
    partial.replace(path)
    return size


def export_points(store: PointStore, settings: Settings, root: Path) -> tuple[Path, int, int]:
    """Write `points.json` from the stored points; returns its path, point count and gzip size."""
    rows = store.load_points()
    document = points_document(rows, datetime.datetime.now(datetime.UTC))
    path = resolve(settings.points_json_path, root)
    size = write_points(document, path)
    placed = sum(1 for row in rows if row.x is not None and row.y is not None)
    return path, placed, size
