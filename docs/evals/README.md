# Eval reports

Reports of eval runs (`uv run --directory apps/api python -m site_api.evals --run`), one JSON file per run, named by time and system prompt version. A run costs money and happens only with Ivan's consent, after `--estimate` (CLAUDE.md golden rule 13).

Each report holds: router accuracy (overall and per class), the rule-check pass rate (per case type and per language), the judge's faithfulness and answer relevancy, the thresholds from config, the failed cases with the checks they failed, and the run's cost.

- Cases: `apps/api/src/site_api/evals/cases.yaml`.
- Analysis: the `rag-evaluator` subagent reads one report, or compares two.
- Prompt changes: the `prompt-change` skill (old and new version, compared on the same cases).

## Recorded runs

Reports name the system prompt in the file name; from 2026-11-08 they also record `router_prompt` inside. This table adds the router version and the outcome.

| Report | System / router | Cases | Router accuracy | Rule pass rate | Faithfulness | Answer relevancy | Cost | Result |
|---|---|---|---|---|---|---|---|---|
| `2026-11-06T064528Z-system.v2.json` | v2 / v1 | 42 | 0.95 | 0.95 | 1.00 | 0.94 | $0.054 | failed: judge coverage 0.89 (two questions about Ivan's work routed `off_topic`) |
| `2026-11-06T065756Z-system.v2.json` | v2 / v2 | 46 | 1.00 | 0.98 | 1.00 | 1.00 | $0.019 | passed (one phrase check too narrow for an honest "does not list"; widened afterwards) |
| `2026-11-07T061950Z-system.v2.json` | v2 / v2 | 46 | 1.00 | 1.00 | 1.00 | 0.99 | $0.053 | passed after two retrieval changes: SPEC §5.6 example Q&A left out of the knowledge base, and a relative floor (`RETRIEVAL_MIN_RELATIVE_SCORE` 0.6) drops sources below 60% of the best |
| `2026-11-07T085052Z-system.v2.json` | v2 / v2 | 49 | 1.00 | 1.00 | 1.00 | 0.98 | $0.060 | passed with the new source `data/github-projects.md` (what Ivan's code shows) and three cases for it (Smart-business state, TanStack Query in UK, an unknown GraphQL client) |
| `2026-11-08T092702Z-system.v2.json` | v2 / v2 | 6 | 1.00 | 0.50 | 1.00 | 0.71 | $0.011 | baseline of six new cases from Ivan's live check: "Where has Ivan worked?", the current job in Ukrainian and in a Russian request for Armenian found personal facts instead of jobs (no BrainRocket, no Liketelecom) |
| `2026-11-08T095609Z-system.v2.json` | v2 / v3 | 58 | 1.00 | 0.97 | 1.00 | 0.98 | $0.086 | passed: router v3 writes an English search query and adds the `rude` class; "Career at a glance" and "Projects at a glance" in the experience notes; `RETRIEVAL_TOP_K` 8, `RETRIEVAL_MIN_RELATIVE_SCORE` 0.5. Two phrase checks failed: an honest "doesn't list Google" (wording added) and NumbersValidator described without its name (the NDA rule on project names) |
| `2026-11-08T100324Z-system.v2.json` | v2 / v3 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | $0.011 | the two failed cases and the NumbersValidator case, after the notes say NumbersValidator is public and not under NDA |
| `2026-11-08T152318Z-system.v3.json` | v3 / v3 | 59 | 1.00 | 1.00 | 1.00 | 0.97 | $0.089 | passed: Ivan shared that he is married (SPEC §5.3; the rest of his family stays private); "Is Ivan married?" now expects "married", a new case asks about his wife |
| `2026-11-08T153712Z-system.v4.json` | v4 / v4 | 62 | 1.00 | 0.97 | 1.00 | 1.00 | $0.099 | passed: job descriptions (SPEC §5.7), questions up to 5000 characters, the router reads continuations in the history; three new cases (a vacancy, its second half without a question, a link only). Two honest wordings ("doesn't say", "don't mention") added to the unknown-fact checks. Seen in the answers: one search query for a whole vacancy misses some requirements (education, testing) |
| `2026-11-08T160140Z-system.v4.json` | v4 / v5 | 62 | 1.00 | 1.00 | 0.99 | 0.96 | $0.089 | failed: judge coverage 0.94 (the judge could not score one long job-fit answer). Router v5: several search queries, merged in turns; `RETRIEVAL_TOP_K_MULTI` 16. The job-fit answers now name his degree, Jest and this site's tests |
| `2026-11-08T192422Z-system.v4.json` | v4 / v5 | 62 | — | — | — | — | — | not counted: the model provider was unavailable (`upstream_unavailable` on six cases) |
| `2026-11-08T193749Z-system.v4.json` | v4 / v6 | 63 | 1.00 | 0.98 | 1.00 | 0.98 | — | failed: judge coverage 0.88 (one judge error on a long answer; the full vacancy case timed out while the provider was slow, live it took 8 s). Router v6: up to 8 queries, one about work format and relocation when a vacancy names a place; `RETRIEVAL_TOP_K_MULTI` 20 |
| `2026-11-08T194102Z-system.v4.json` | v4 / v6 | 5 | 1.00 | 1.00 | 1.00 | 1.00 | $0.023 | the job-fit and broad cases after `EVAL_JUDGE_MAX_OUTPUT_TOKENS` 1500 → 3000 (the judge lists many statements for a long answer) |
| `2026-11-08T194939Z-system.v4.json` | v4 / v6 | 63 | 1.00 | 1.00 | 0.99 | 0.98 | $0.064 | passed: the whole suite with router v6 and system v4 |
| `2026-11-08T202105Z-system.v5.json` | v5 / v6 | 64 | 1.00 | 1.00 | 1.00 | 0.98 | $0.116 | passed: system v5 says "Ivan hasn't shared that" in the visitor's language (it came in English to a question in Russian); a new case asks in Russian; the notes now say how the site is tested (Playwright, axe, Vitest, …) |
