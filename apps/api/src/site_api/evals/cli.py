"""Command line entry point for evals: `python -m site_api.evals --estimate | --run`.

Evals call real models and cost money, so the CLI forces a choice between a free cost estimate
and an actual run (CLAUDE.md golden rule 13: run only with Ivan's consent, after an estimate).
A run needs `--yes` (the estimate was agreed), prints the estimate again first, stops early if it
costs more than EVAL_MAX_COST_FACTOR times the estimate, then prints the report, saves it as JSON
under `docs/evals/` and exits 1 when any threshold in config is not met.
"""

import argparse
import asyncio
import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from site_api.core.config import Settings, find_env_file
from site_api.evals.cases import EvalCase, load_cases
from site_api.evals.estimate import estimate_run, format_estimate
from site_api.evals.report import RunReport, build_report, format_report
from site_api.graph.router import ROUTER_PROMPT_FILE
from site_api.prompts.answer import SYSTEM_PROMPT_FILE


def build_parser() -> argparse.ArgumentParser:
    """Build the parser; `--estimate` and `--run` are mutually exclusive and one is required."""
    parser = argparse.ArgumentParser(
        prog="python -m site_api.evals",
        description="Run RAG evals. They cost money: estimate first, run only with consent.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--estimate", action="store_true", help="print case count and cost, no calls")
    mode.add_argument("--run", action="store_true", help="run the eval suite (paid API calls)")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm a paid run: Ivan has seen the estimate and agreed (required with --run)",
    )
    parser.add_argument(
        "--case",
        action="append",
        default=[],
        metavar="ID",
        help="only these case ids (repeatable); all cases when left out",
    )
    return parser


def select_cases(ids: Sequence[str]) -> list[EvalCase]:
    """The cases to run: all, or the ones named (an unknown id is an error)."""
    cases = list(load_cases())
    if not ids:
        return cases
    known = {case.id for case in cases}
    unknown = sorted(set(ids) - known)
    if unknown:
        msg = f"unknown eval case ids: {', '.join(unknown)}"
        raise SystemExit(msg)
    return [case for case in cases if case.id in ids]


def reports_dir() -> Path:
    """`docs/evals/` of the repository (next to `.env.example`), or `./eval-results` outside it."""
    env_file = find_env_file(Path(__file__))
    return env_file.parent / "docs" / "evals" if env_file else Path("eval-results")


def save_report(report: RunReport, directory: Path) -> Path:
    """Write the report as JSON, named by the time and the prompt version; return its path.

    Both prompt versions are recorded: a router change alone also changes the answers.
    """
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H%M%SZ")
    path = directory / f"{stamp}-{Path(SYSTEM_PROMPT_FILE).stem}.json"
    data = {
        "prompt": SYSTEM_PROMPT_FILE,
        "router_prompt": ROUTER_PROMPT_FILE,
        **report.to_json(),
    }
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    return path


def main(argv: Sequence[str] | None = None, settings: Settings | None = None) -> int:
    """Parse arguments, estimate or run, print the result and return the exit code."""
    args = build_parser().parse_args(argv)
    # Settings are read from the environment / `.env` only when a command really runs.
    settings = settings or Settings()  # pyright: ignore[reportCallIssue] -- values come from the environment
    cases = select_cases(args.case)
    estimate = estimate_run(cases, settings)
    print(format_estimate(estimate))
    if args.estimate:
        return 0
    if not args.yes:
        # CLAUDE.md golden rule 13: a paid run only after the estimate and Ivan's consent.
        print("A run costs money. Re-run with --yes once the estimate above is agreed.")
        return 2
    # Imported here: a real run needs the database driver, the model clients and DeepEval.
    from site_api.evals.runner import run_suite  # noqa: PLC0415
    from site_api.graph.models import ModelConfigError  # noqa: PLC0415

    max_cost = estimate.total_usd * settings.eval_max_cost_factor
    try:
        # The selector loop on every OS: async psycopg refuses Windows' default Proactor loop
        # (production and `fastapi dev` use the selector loop too; tests/conftest.py).
        results = asyncio.run(
            run_suite(cases, settings, max_cost), loop_factory=asyncio.SelectorEventLoop
        )
    except (ModelConfigError, ValueError) as error:
        # A missing API key: say which, without a stack trace.
        print(f"Cannot run the evals: {error}")
        return 1
    report = build_report(results, settings)
    print(format_report(report))
    print(f"Report: {save_report(report, reports_dir())}")
    return 0 if report.passed else 1
