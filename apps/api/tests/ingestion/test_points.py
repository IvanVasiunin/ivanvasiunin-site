"""Points on the map and `points.json` (ROADMAP 6.1, SPEC §4.4), on an in-memory store."""

import datetime
import gzip
import json
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path

import numpy as np
import pytest

from site_api.core.config import Settings
from site_api.ingestion.cli import build_parser, run_map
from site_api.ingestion.points import (
    MAX_POINTS_GZIP_BYTES,
    PointRow,
    points_document,
    resolve,
    update_points,
    write_points,
)

DIMS = 16


def rows(count: int, seed: int = 0) -> list[PointRow]:
    """`count` chunks in two clusters, none placed yet."""
    rng = np.random.default_rng(seed)
    centres = rng.normal(size=(2, DIMS))
    return [
        PointRow(
            id=f"cv:job-{index:03d}:0",
            source_type="cv" if index % 2 == 0 else "experience",
            section=f"Section {index % 2}",
            embedding=[float(v) for v in centres[index % 2] + 0.2 * rng.normal(size=DIMS)],
            x=None,
            y=None,
        )
        for index in range(count)
    ]


class FakePointStore:
    """A `PointStore` in memory that records what was saved."""

    def __init__(self, stored: list[PointRow]) -> None:
        self.rows = {row.id: row for row in stored}
        self.saved: list[dict[str, tuple[float, float]]] = []

    def load_points(self) -> list[PointRow]:
        return [self.rows[key] for key in sorted(self.rows)]

    def save_points(self, points: Mapping[str, tuple[float, float]]) -> None:
        self.saved.append(dict(points))
        for key, (x, y) in points.items():
            row = self.rows[key]
            self.rows[key] = PointRow(row.id, row.source_type, row.section, row.embedding, x, y)


@pytest.fixture
def map_settings(settings: Settings, tmp_path: Path) -> Settings:
    return settings.model_copy(
        update={
            "projection_model_path": tmp_path / "projection.joblib",
            "points_json_path": tmp_path / "data" / "points.json",
        }
    )


def test_the_first_run_fits_the_whole_map_and_keeps_the_model(
    map_settings: Settings, tmp_path: Path
) -> None:
    store = FakePointStore(rows(30))

    update = update_points(store, map_settings, tmp_path, refit=False)

    assert (update.refitted, update.placed, update.total) == (True, 30, 30)
    assert all(row.x is not None and row.y is not None for row in store.load_points())
    assert (tmp_path / "projection.joblib").is_file()


def test_a_new_chunk_is_placed_and_every_other_point_stays(
    map_settings: Settings, tmp_path: Path
) -> None:
    store = FakePointStore(rows(30))
    update_points(store, map_settings, tmp_path, refit=False)
    before = {row.id: (row.x, row.y) for row in store.load_points()}
    new = rows(31, seed=0)[30]
    store.rows[new.id] = new

    update = update_points(store, map_settings, tmp_path, refit=False)

    assert (update.refitted, update.placed, update.total) == (False, 1, 31)
    assert list(store.saved[-1]) == [new.id]
    after = {row.id: (row.x, row.y) for row in store.load_points()}
    assert all(after[key] == point for key, point in before.items())


def test_nothing_to_place_writes_nothing(map_settings: Settings, tmp_path: Path) -> None:
    store = FakePointStore(rows(30))
    update_points(store, map_settings, tmp_path, refit=False)
    saves = len(store.saved)

    update = update_points(store, map_settings, tmp_path, refit=False)

    assert (update.refitted, update.placed) == (False, 0)
    assert len(store.saved) == saves


def test_refit_fits_again_even_with_a_model(map_settings: Settings, tmp_path: Path) -> None:
    store = FakePointStore(rows(30))
    update_points(store, map_settings, tmp_path, refit=False)

    assert update_points(store, map_settings, tmp_path, refit=True).refitted


def test_a_lost_model_file_means_a_refit(map_settings: Settings, tmp_path: Path) -> None:
    store = FakePointStore(rows(30))
    update_points(store, map_settings, tmp_path, refit=False)
    (tmp_path / "projection.joblib").unlink()
    store.rows["cv:new:0"] = PointRow("cv:new:0", "cv", "New", rows(1)[0].embedding, None, None)

    assert update_points(store, map_settings, tmp_path, refit=False).refitted


def test_an_empty_base_has_no_map(map_settings: Settings, tmp_path: Path) -> None:
    assert update_points(FakePointStore([]), map_settings, tmp_path, refit=False).total == 0


def test_two_chunks_are_too_few_for_a_map(map_settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="at least 3 chunks"):
        update_points(FakePointStore(rows(2)), map_settings, tmp_path, refit=False)


def test_points_json_carries_titles_and_concepts_never_text() -> None:
    text = "Senior Markup Developer at BrainRocket: Angular, SCSS. A private sentence."
    placed = [
        PointRow("cv:brainrocket:3", "cv", "BrainRocket", [0.1], 0.123456, 0.987654, text),
        PointRow("about:dog:0", "personal", "Monty", [0.2], None, None, "Monty is a corgi."),
    ]

    document = points_document(placed, datetime.datetime(2026, 11, 6, 12, tzinfo=datetime.UTC))

    # SPEC §4.4 v2: ids equal the `chunk_id` of `sources` events; titles as in that event; the
    # concepts the text mentions, and the catalogue entries for them. No chunk text, no embedding.
    assert document == {
        "version": "2026-11-06T12:00:00Z",
        "points": [
            {
                "id": "cv:brainrocket:3",
                "x": 0.1235,
                "y": 0.9877,
                "source_type": "cv",
                "section": "BrainRocket",
                "title": "CV — BrainRocket",
                "c": ["brainrocket", "scss", "angular"],
            }
        ],
        "concepts": [
            {"id": "brainrocket", "label": "BrainRocket", "aliases": ["brainrocket"]},
            {"id": "scss", "label": "SCSS", "aliases": ["scss", "sass"]},
            {"id": "angular", "label": "Angular", "aliases": ["angular"]},
        ],
    }
    assert "private sentence" not in json.dumps(document)


def test_points_json_for_a_large_base_stays_within_50_kb_gzipped(tmp_path: Path) -> None:
    # About ten times today's 240 chunks, with long section names.
    rng = np.random.default_rng(1)
    many = [
        PointRow(
            f"experience:project-{i:04d}:{i % 7}",
            "experience",
            f"A rather long section title {i}",
            [0.0],
            *rng.random(2),
        )
        for i in range(2000)
    ]

    size = write_points(
        points_document(many, datetime.datetime.now(datetime.UTC)), tmp_path / "points.json"
    )

    assert size <= MAX_POINTS_GZIP_BYTES
    assert len(gzip.compress((tmp_path / "points.json").read_bytes())) == size


def test_over_the_budget_nothing_is_written(tmp_path: Path) -> None:
    rng = np.random.default_rng(2)
    noise = {"points": [{"id": rng.bytes(40).hex()} for _ in range(5000)]}

    with pytest.raises(ValueError, match="over the 50 KB budget"):
        write_points(noise, tmp_path / "points.json")

    assert not (tmp_path / "points.json").exists()


def test_configured_paths_are_under_the_repository_root_unless_absolute(tmp_path: Path) -> None:
    assert (
        resolve(Path("apps/web/public/data/points.json"), tmp_path)
        == tmp_path / "apps/web/public/data/points.json"
    )
    assert resolve(tmp_path / "x.json", Path("elsewhere")) == tmp_path / "x.json"


def test_the_map_report_and_the_written_file(map_settings: Settings, tmp_path: Path) -> None:
    store = FakePointStore(rows(30))

    report = run_map(store, map_settings, tmp_path, refit=False)

    assert report.startswith("Map: fitted anew for all 30 chunks.\npoints.json: 30 points")
    written = json.loads((tmp_path / "data" / "points.json").read_text(encoding="utf-8"))
    assert {point["id"] for point in written["points"]} == set(store.rows)


def test_refit_needs_apply(capsys: pytest.CaptureFixture[str]) -> None:
    from site_api.ingestion.cli import main  # noqa: PLC0415 -- the entry point under test

    with pytest.raises(SystemExit) as exc:
        main(["--estimate", "--refit"])

    assert exc.value.code == 2
    assert "--refit needs --apply" in capsys.readouterr().err
    assert build_parser().parse_args(["--apply", "--refit"]).refit


def test_the_api_never_loads_the_projection_libraries(monkeypatch: pytest.MonkeyPatch) -> None:
    # ADR-0006: numba / UMAP are for ingestion only; importing the app must not pull them in.
    code = "import sys, site_api.main; print('umap' in sys.modules, 'numba' in sys.modules)"
    # `site_api.main` refuses to import without DATABASE_URL (CI has no .env); importing it never
    # connects, so a placeholder URL is enough. The child process inherits the patched environment.
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:placeholder@127.0.0.1:1/none")
    result = subprocess.run(  # noqa: S603 -- a fixed command, this interpreter
        [sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=120
    )

    assert result.stdout.strip() == "False False"
