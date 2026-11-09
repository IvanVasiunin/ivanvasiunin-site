---
name: run-checks
description: Determines the type of change from the changed files and runs the matching set of checks from docs/TESTING.md (fast checks plus e2e, visual, performance or contract checks as needed). Use after finishing a change and before writing the step report.
---

# Run checks for the current change

1. List the changed files:

   ```
   git status --porcelain -uall
   git diff --name-only HEAD
   ```

2. Classify them with the table in `docs/TESTING.md` §3:

| Files | Change type | Checks |
|---|---|---|
| any in `apps/web/` or `apps/api/` | — | fast checks: `node scripts/check-fast.mjs <apps>` |
| `apps/web/src/**/*.{astro,tsx,scss}` (UI) | markup / styles / components | e2e of the affected flows (desktop + one mobile profile), visual snapshots, axe |
| `apps/web/src/islands/Chat/**`, `src/lib/sse/**` | streaming | chat e2e on mocked LLM (desktop + mobile) + API contract tests |
| `apps/web/src/islands/KnowledgeMap/**`, `src/lib/viz/**` | visualization | skill `perf-check` (long frames 4× / 6×), screenshots both themes, bundle / JSON budget |
| `apps/api/src/site_api/{core,routers,schemas,services,db}/**`, `migrations/**` | API | contract tests; regenerate TS types and check staleness |
| `apps/api/src/site_api/{prompts,rag,graph}/**` | prompts / retrieval / graph | **evals: estimate the cost and ask Ivan first — never run without consent** |
| `apps/api/src/site_api/ingestion/**` | ingestion | re-ingest fixtures, `points.json` contract + size |
| `infra/**`, `Dockerfile`, `.github/**` | infra | `docker compose config`, build + healthcheck smoke, `security-reviewer` |
| `package.json`, `pnpm-lock.yaml`, `pyproject.toml`, `uv.lock` | dependencies | `pnpm audit`, `pip-audit` |

3. Run the checks. Delegate noisy runs (e2e, full test suites) to the **`test-runner`** subagent so that only failures come back.
4. If something fails: fix it. Never weaken, skip or delete tests (`.claude/rules/testing.md`). In the mentor zone, report it instead of rewriting Ivan's code.
5. Put the commands and results into the **Проверки** table of the `step-report`.
