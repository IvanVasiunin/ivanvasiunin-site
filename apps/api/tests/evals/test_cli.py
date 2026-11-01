import subprocess
import sys

import pytest

from site_api.evals.cli import main


def test_estimate_reports_zero_cases_and_cost(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--estimate"]) == 0
    assert capsys.readouterr().out == "Eval cases: 0. Estimated cost: $0.00 (no cases yet).\n"


def test_run_reports_nothing_to_run(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--run"]) == 0
    assert capsys.readouterr().out == "Eval cases: 0. Nothing to run.\n"


@pytest.mark.parametrize("argv", [[], ["--estimate", "--run"]])
def test_mode_is_required_and_exclusive(argv: list[str]) -> None:
    # argparse exits with code 2 on usage errors, so a bare call never starts a paid run.
    with pytest.raises(SystemExit) as exc:
        main(argv)
    assert exc.value.code == 2


def test_module_entry_point() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "site_api.evals", "--estimate"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "Eval cases: 0." in result.stdout
