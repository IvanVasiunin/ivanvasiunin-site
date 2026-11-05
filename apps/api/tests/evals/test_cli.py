"""The eval CLI: a free estimate, a run only on explicit request (never a paid call in tests)."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.core.config import Settings
from site_api.evals import cli
from site_api.evals.cases import EvalCase, load_cases
from site_api.evals.checks import Answer, check_answer
from site_api.evals.report import CaseResult


class EvalSettings(Settings):
    """Settings without the developer's `.env`."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")


SETTINGS = EvalSettings(database_url=SecretStr("postgresql+psycopg://site@127.0.0.1:9/unused"))


def test_estimate_prints_the_cases_and_a_cost(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["--estimate"], SETTINGS) == 0

    out = capsys.readouterr().out
    assert f"Eval cases: {len(load_cases())} " in out
    assert "Estimated cost (a ceiling): $" in out


def test_estimate_for_chosen_cases_only(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["--estimate", "--case", "greeting-en"], SETTINGS) == 0

    assert "Eval cases: 1 (0 answered by the answer model, 0 judged)." in capsys.readouterr().out


def test_an_unknown_case_id_stops_before_anything_runs() -> None:
    with pytest.raises(SystemExit, match="unknown eval case ids: nope"):
        cli.main(["--estimate", "--case", "nope"], SETTINGS)


@pytest.mark.parametrize("argv", [[], ["--estimate", "--run"]])
def test_mode_is_required_and_exclusive(argv: list[str]) -> None:
    # argparse exits with code 2 on usage errors, so a bare call never starts a paid run.
    with pytest.raises(SystemExit) as exc:
        cli.main(argv, SETTINGS)
    assert exc.value.code == 2


def _passing_result(case: EvalCase) -> CaseResult:
    answer = Answer(
        route=case.route,
        language=case.language,
        text=case.contains_any[0] if case.contains_any else "ok",
        source_count=1 if case.sources else 0,
        finish_reason=case.finish[0],
        error_code=None,
        cost_usd=0.001,
    )
    return CaseResult(case=case, answer=answer, checks=check_answer(case, answer))


def test_run_prints_the_report_and_saves_it(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # The real runner is replaced: a test never calls a model.
    async def fake_suite(
        cases: list[EvalCase], settings: Settings, max_cost_usd: float
    ) -> list[CaseResult]:
        assert max_cost_usd > 0
        return [_passing_result(case) for case in cases]

    monkeypatch.setattr("site_api.evals.runner.run_suite", fake_suite)
    monkeypatch.setattr(cli, "reports_dir", lambda: tmp_path)

    assert cli.main(["--run", "--yes", "--case", "greeting-en"], SETTINGS) == 0

    out = capsys.readouterr().out
    assert "PASSED" in out
    (saved,) = tmp_path.glob("*.json")
    report = json.loads(saved.read_text(encoding="utf-8"))
    assert report["passed"] is True
    assert report["prompt"].startswith("system.v")


def test_a_run_without_yes_stops_after_the_estimate(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # CLAUDE.md golden rule 13: never a paid run without the explicit confirmation.
    async def must_not_run(*args: object) -> list[CaseResult]:
        raise AssertionError

    monkeypatch.setattr("site_api.evals.runner.run_suite", must_not_run)

    assert cli.main(["--run", "--case", "greeting-en"], SETTINGS) == 2
    assert "Re-run with --yes" in capsys.readouterr().out


def test_module_entry_point() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "site_api.evals", "--estimate", "--case", "greeting-en"],
        capture_output=True,
        text=True,
        check=False,
        # The child reads settings from the environment: give it a database URL to parse.
        env={
            "DATABASE_URL": "postgresql+psycopg://site@127.0.0.1:9/unused",
            "SYSTEMROOT": "C:\\Windows",
        },
    )
    assert result.returncode == 0, result.stderr
    assert "Eval cases: 1 " in result.stdout
