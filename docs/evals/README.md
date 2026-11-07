# Eval reports

Reports of eval runs (`uv run --directory apps/api python -m site_api.evals --run`), one JSON file per run, named by time and system prompt version. A run costs money and happens only with Ivan's consent, after `--estimate` (CLAUDE.md golden rule 13).

Each report holds: router accuracy (overall and per class), the rule-check pass rate (per case type and per language), the judge's faithfulness and answer relevancy, the thresholds from config, the failed cases with the checks they failed, and the run's cost.

- Cases: `apps/api/src/site_api/evals/cases.yaml`.
- Analysis: the `rag-evaluator` subagent reads one report, or compares two.
- Prompt changes: the `prompt-change` skill (old and new version, compared on the same cases).

## Recorded runs

A report names the system prompt only; this table adds the router version and the outcome.

| Report | System / router | Cases | Router accuracy | Rule pass rate | Faithfulness | Answer relevancy | Cost | Result |
|---|---|---|---|---|---|---|---|---|
| `2026-11-06T064528Z-system.v2.json` | v2 / v1 | 42 | 0.95 | 0.95 | 1.00 | 0.94 | $0.054 | failed: judge coverage 0.89 (two questions about Ivan's work routed `off_topic`) |
| `2026-11-06T065756Z-system.v2.json` | v2 / v2 | 46 | 1.00 | 0.98 | 1.00 | 1.00 | $0.019 | passed (one phrase check too narrow for an honest "does not list"; widened afterwards) |
| `2026-11-07T061950Z-system.v2.json` | v2 / v2 | 46 | 1.00 | 1.00 | 1.00 | 0.99 | $0.053 | passed after two retrieval changes: SPEC §5.6 example Q&A left out of the knowledge base, and a relative floor (`RETRIEVAL_MIN_RELATIVE_SCORE` 0.6) drops sources below 60% of the best |
| `2026-11-07T085052Z-system.v2.json` | v2 / v2 | 49 | 1.00 | 1.00 | 1.00 | 0.98 | $0.060 | passed with the new source `data/github-projects.md` (what Ivan's code shows) and three cases for it (Smart-business state, TanStack Query in UK, an unknown GraphQL client) |
