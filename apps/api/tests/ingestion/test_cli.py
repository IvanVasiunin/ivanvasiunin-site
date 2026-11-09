"""The ingestion CLI and the embeddings factory (ROADMAP 3.4). No API call, no database."""

from pathlib import Path

import pytest
from langchain_core.embeddings import Embeddings
from pydantic import SecretStr

from site_api.core.config import Settings
from site_api.ingestion.cli import build_parser, find_repo_root, main, run
from site_api.ingestion.embeddings import create_embeddings
from site_api.ingestion.sources import load_all

from .conftest import FakeEmbeddings, FakeStore

REPO_ROOT = Path(__file__).resolve().parents[4]


def no_embeddings(settings: Settings) -> Embeddings:
    raise AssertionError("an estimate must not create the embeddings client")


@pytest.mark.parametrize("argv", [[], ["--estimate", "--apply"]])
def test_mode_is_required_and_exclusive(argv: list[str]) -> None:
    # argparse exits with code 2, so a bare call never starts a paid run.
    with pytest.raises(SystemExit) as exc:
        build_parser().parse_args(argv)
    assert exc.value.code == 2


def test_repo_root_is_found_from_a_subfolder() -> None:
    assert find_repo_root(REPO_ROOT / "apps" / "api") == REPO_ROOT


def test_repo_root_outside_the_repo_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="--root"):
        find_repo_root(tmp_path)


def test_estimate_reports_the_plan_and_writes_nothing(store: FakeStore, settings: Settings) -> None:
    report = run(False, load_all(REPO_ROOT), settings, store, no_embeddings)

    assert "0 unchanged" in report
    assert "to compute" in report
    assert "Estimate only" in report
    assert store.rows == {}


def test_apply_then_rerun_is_up_to_date(
    store: FakeStore, embeddings: FakeEmbeddings, settings: Settings
) -> None:
    def make_embeddings(_: Settings) -> Embeddings:
        return embeddings

    assert run(True, load_all(REPO_ROOT), settings, store, make_embeddings).endswith("Applied.")
    first_run_calls = len(embeddings.calls)

    report = run(True, load_all(REPO_ROOT), settings, store, make_embeddings)

    assert report.endswith("Already up to date.")
    assert "0 to write, 0 to delete" in report
    assert len(embeddings.calls) == first_run_calls  # no new calls on the re-run


def test_embeddings_use_the_configured_model_and_size(settings: Settings) -> None:
    configured = settings.model_copy(update={"openai_api_key": SecretStr("sk-test-not-real")})

    client = create_embeddings(configured)

    assert client.model == "text-embedding-3-large"
    assert client.dimensions == configured.embedding_dimensions


def test_embeddings_need_an_api_key(settings: Settings) -> None:
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        create_embeddings(settings)


def test_a_usage_error_exits_with_1_and_a_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # No SPEC.md above the working directory: a clear one-line error, no traceback, no DB call.
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://site@127.0.0.1:1/site")
    monkeypatch.chdir(tmp_path)

    assert main(["--estimate"]) == 1
    assert "ingestion: No SPEC.md" in capsys.readouterr().err
