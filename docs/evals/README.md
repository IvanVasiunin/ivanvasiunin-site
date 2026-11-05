# Eval reports

Reports of eval runs (`uv run --directory apps/api python -m site_api.evals --run`), one JSON file per run, named by time and system prompt version. A run costs money and happens only with Ivan's consent, after `--estimate` (CLAUDE.md golden rule 13).

Each report holds: router accuracy (overall and per class), the rule-check pass rate (per case type and per language), the judge's faithfulness and answer relevancy, the thresholds from config, the failed cases with the checks they failed, and the run's cost.

- Cases: `apps/api/src/site_api/evals/cases.yaml`.
- Analysis: the `rag-evaluator` subagent reads one report, or compares two.
- Prompt changes: the `prompt-change` skill (old and new version, compared on the same cases).
