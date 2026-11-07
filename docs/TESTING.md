# Testing

- **Status:** Final for Phase 0. Commands in §2 match the scripts in the repository; rows marked "from ROADMAP x.y" arrive with that task.
- **Last updated:** 2026-11-01

## 1. Strategy

| Level | Tooling | Scope |
|---|---|---|
| Unit (frontend) | Vitest | SSE parsing, chat state, Brief / Full, "Ask about this", visualization logic (scaling, highlight selection, intensity) |
| Unit (backend) | pytest, pytest-asyncio | Services, graph nodes, chunking, projection, limits. **LLM calls are always mocked.** |
| Component | Vitest + Testing Library + user-event (jsdom) | Every state: default, focus, disabled, loading, error, empty; keyboard interaction |
| API and contract | pytest + httpx `AsyncClient` | Response schemas, error format, rate limits, every SSE event type; generated TS types match OpenAPI (CI staleness check) |
| E2E | Playwright: desktop Chromium + mobile profiles (iPhone on WebKit, Android on Chromium) | Mode switching, keyboard; Brief / Full + URL; "Ask about this" never sends; streaming chat on a mocked LLM, Stop, network errors; Under the hood contents; point highlight |
| Visual regression | Playwright screenshots | Key screens at 360 / 768 / 1440, light and dark, plus the CV print version |
| Accessibility | @axe-core/playwright inside e2e | Every screen: **zero serious or critical** violations |
| Performance | Lighthouse 13 (mobile + desktop budgets, `scripts/lighthouse.mjs`); Playwright + CDP long-frame measurement at 4× / 6× CPU | Budgets in §5 |
| RAG evals | pytest + DeepEval, separate command | Faithfulness, relevance; router accuracy per class; unknown fact → "no information"; NDA and salary policy. Thresholds in config; below threshold = fail. **Costs money, runs only with Ivan's consent.** |
| Security | gitleaks, pnpm audit, pip-audit | Pre-commit (gitleaks) + CI |

## 2. Commands

All commands run from the repository root.

| Purpose | Command |
|---|---|
| Fast checks, all targets | `node scripts/check-fast.mjs` (`web`, `api`, `scripts`; `--changed` for uncommitted changes only; `--strict` in CI). The Stop hook runs `--changed` |
| Fast checks, web | `node scripts/check-fast.mjs web` = `pnpm --dir apps/web run check:fast` (Prettier check, ESLint, Stylelint, `astro check` + `tsc`, Vitest) |
| Fast checks, api | `node scripts/check-fast.mjs api` (ruff format --check, ruff check, pyright, `pytest -m "not mentor_pending and not db"`) |
| Migrations on a live DB (from ROADMAP 3.1) | `docker compose -f infra/docker-compose.dev.yml up -d --wait`, then `TEST_DATABASE_URL=postgresql+psycopg://site:<POSTGRES_PASSWORD>@127.0.0.1:5432/site_test uv run --directory apps/api pytest -m db` (up → down → up, indexes, constraints; the database name must end in `_test`). The offline SQL of every migration is checked by the fast checks (`tests/db/test_migration_sql.py`) |
| E2E (+ axe) | `pnpm --dir apps/web run e2e` (all projects) / `pnpm --dir apps/web run e2e --project=mobile-android` (no `--` before Playwright flags: pnpm forwards it and Playwright then ignores the flags) |
| Visual snapshots (from ROADMAP 1.1) | run as part of `e2e` in the `visual-chromium` project (`apps/web/e2e/visual.spec.ts`); update: `pnpm --dir apps/web run e2e --project=visual-chromium --update-snapshots` (only with Ivan's OK). Baselines are per platform: `-win32` locally; the Linux ones (CI job `visual`) are made in the Playwright image with `pnpm --dir apps/web run e2e:visual:linux --update-snapshots` (needs Docker) |
| API types (from ROADMAP 1.5) | regenerate: `pnpm --dir apps/web run gen:api`; staleness check (CI job `contract`): `pnpm --dir apps/web run gen:api:check` |
| Infrastructure (from ROADMAP 1.6) | `node scripts/check-infra.mjs` (Compose / Dockerfile / .dockerignore rules, needs the Docker CLI); against a running stack: `node scripts/check-headers.mjs https://localhost` (CI job `infra` runs both, plus the image build, image scan and `docker compose up`) |
| Build (+ CV PDF, needs Playwright Chromium) + JS budgets | `pnpm --dir apps/web run build` then `pnpm --dir apps/web run budget` |
| Lighthouse budgets | `pnpm --dir apps/web run lighthouse` (build, then mobile + desktop; CI job `lighthouse`) |
| Performance, long frames (from ROADMAP 6.4) | skill `perf-check` |
| Evals | `uv run --directory apps/api python -m site_api.evals --estimate` then `… --run` |
| Mentor-pending report | `uv run --directory apps/api pytest -m mentor_pending --co -q` |
| CI (`.github/workflows/ci.yml`) | Jobs `web` (fast checks, build, budgets), `api` (fast checks + non-blocking mentor-pending report), `api-db` (migration tests on a Postgres + pgvector service container), `security` (gitleaks over the whole history, repo scripts, `pnpm audit --prod` blocking / dev report-only, pip-audit). Fast checks run with `--strict`, so a missing app fails instead of being skipped |
| Fast checks, repo scripts and hooks | `node scripts/check-fast.mjs scripts` (Prettier + `node --test scripts/*.test.mjs .claude/hooks/*.test.mjs`) |
| Git hooks (lefthook) | pre-commit: gitleaks on the staged diff, Prettier, ESLint, Stylelint, ruff (fix + re-stage); commit-msg: `scripts/check-commit-msg.mjs`. Dry run: `pnpm exec lefthook run pre-commit` |
| Full pre-PR | skill `pre-pr-check` |

## 3. Which checks for which change

| Change | Fast checks | Additionally |
|---|---|---|
| Any file | Fast checks of the affected app (Stop hook) | — |
| Markup / styles / components | ✔ | E2E of affected flows (desktop + one mobile profile); visual snapshots; axe |
| Chat streaming / SSE client | ✔ | Chat e2e on a mocked LLM (desktop + mobile); API contract tests |
| Visualization | ✔ | Long-frame measurement at 4× / 6×; screenshots both themes; JS / JSON budget |
| API (non-AI) | ✔ | Contract tests; TS type regeneration |
| Database migrations | ✔ (offline SQL) | `pytest -m db` on the dev database (CI job `api-db`); `security-reviewer` for compose / deploy changes |
| Prompts, retrieval, graph | ✔ | **Evals: cost estimate first, run only with Ivan's consent** |
| Ingestion / projection | ✔ | Re-ingest on fixtures; `points.json` contract + size |
| Docker / Caddy / CI | ✔ | `docker compose up` smoke + healthchecks; `security-reviewer` |
| Dependencies | ✔ | `pnpm audit` / `pip-audit` |
| Before every commit | — | Skill `pre-pr-check` (full suite except evals and the slowest perf runs) |

**Rules:**
- A task is not done until its checks are green.
- New logic comes with new tests in the same change. A fixed bug comes with a test that reproduces it.
- Every task report has a **Checks** block listing the commands and their results.
- A red test is never "fixed" by weakening the assertion, adding `skip` or deleting it without Ivan's consent. The only exception is `mentor_pending` (§4).
- **Coverage targets** (guidance, not a goal in itself):
  - ≥ 80% lines for `apps/api` services and graph;
  - ≥ 70% for frontend logic;
  - markup is not measured.

## 4. The `mentor_pending` marker

- Registered in `apps/api/pyproject.toml` under `[tool.pytest].markers` (pytest ≥ 9 native TOML table). `strict = true` makes any unregistered marker an error.
- `pytest -m mentor_pending --co -q` exits with code 5 ("no tests collected") when there are no pending tasks; CI treats that as success.
- Claude adds `@pytest.mark.mentor_pending` to the failing tests it writes for a mentor task ([ADR-0007](adr/0007-mentor-mode.md)).
- Excluded from:
  - fast checks;
  - the **Stop hook**;
  - the failing part of CI.

  All of these use `-m "not mentor_pending"`.
- CI runs them in a separate, non-blocking step and prints them as a list.
- The marker is removed **only when Ivan says the task is done**. From then on, the tests are ordinary tests.
- The Stop hook never runs these tests, so it can never push Claude to complete mentor-zone code.

## 5. Budgets

| Metric | Budget |
|---|---|
| `/cv` Lighthouse mobile (Slow 4G, CPU throttling) | LCP < 2.5 s, CLS < 0.1, INP < 200 ms; ≥ 95 in all four categories |
| `/cv` desktop | LCP < 2.0 s |
| JS on `/cv` | ≤ 30 KB gzip |
| JS on `/` total | ≤ 200 KB gzip; ≤ 150 KB before the visualization loads |
| `points.json` | ≤ 50 KB gzip |
| TTFT, production p50 | < 2 s |
| Long frames during the knowledge map's ignition at 6× CPU | Threshold defined after the prototype (start: < 5% of frames > 50 ms) |
| Coverage | `apps/api` services and graph ≥ 80%; frontend logic ≥ 70% |

## 6. Device matrix

| Profile | Engine | Throttling | Purpose |
|---|---|---|---|
| Desktop 1440 | Chromium | none | Baseline |
| iPhone (Playwright device descriptor) | WebKit | network Slow 4G | iOS layout, keyboard-related CSS |
| Android mid-range (descriptor) | Chromium | Slow 4G + CPU 4× | Typical phone |
| Android weak (descriptor) | Chromium | Slow 4G + CPU 6× | Weak device, light visualization mode |
| Widths 360 / 390 / 768 / 1024 / 1440 | Chromium | none | Responsive layout snapshots |

**Real devices:** iPhone 17 Pro Max, checked manually before release. There is no physical weak Android, so it is emulated at 6× CPU.

**Known gaps in automated checks** (manual checks on real devices, ROADMAP 7.5):
- Visual snapshots in CI: the `visual` job only warns until the Linux baselines are created with `e2e:visual:linux --update-snapshots` (needs Docker; ROADMAP 1.8).
- Mode switch view transitions (ADR-0009). Under CDP CPU + network throttling, Chromium reveals the new page without a view transition even though it loads in about 1.4 s (cause UNVERIFIED), so the throttled Android profile skips the "runs a transition" test.
- The prerender → activation path. Playwright init scripts do not run in prerendered pages, so it is not observed.

Check on a real Android Chrome and on iOS Safari 18.2+.

**Cloud real-device services:** free or trial options to evaluate in Phase 7. Their current free tiers are UNVERIFIED:
- BrowserStack (free for open source on application);
- LambdaTest (free plan with limited minutes).

## 7. Real-device log

| Date | Device / OS / browser | Build (git sha) | Checks | Result | Issues |
|---|---|---|---|---|---|
| — | iPhone 17 Pro Max / iOS — / Safari | — | Chat keyboard, safe area, dark theme, CV print | — | — |
