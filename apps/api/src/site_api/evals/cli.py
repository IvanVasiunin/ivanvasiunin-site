"""Command line entry point for evals: `python -m site_api.evals --estimate | --run`.

Evals call real models and cost money, so the CLI forces a choice between a free cost estimate
and an actual run (CLAUDE.md golden rule 13: run only with Ivan's consent, after an estimate).
This is a stub: there are no cases or metrics yet, so both modes report zero work. The real
estimate will take model prices from config (core/config.py), never from literals here.
"""

import argparse
from collections.abc import Sequence


def build_parser() -> argparse.ArgumentParser:
    """Build the parser; `--estimate` and `--run` are mutually exclusive and one is required."""
    parser = argparse.ArgumentParser(
        prog="python -m site_api.evals",
        description="Run RAG evals. They cost money: estimate first, run only with consent.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--estimate", action="store_true", help="print case count and cost, no calls")
    mode.add_argument("--run", action="store_true", help="run the eval suite (paid API calls)")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments, print the result and return the process exit code."""
    args = build_parser().parse_args(argv)
    if args.estimate:
        print("Eval cases: 0. Estimated cost: $0.00 (no cases yet).")
    else:
        print("Eval cases: 0. Nothing to run.")
    return 0
