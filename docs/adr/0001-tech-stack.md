# ADR-0001: Technology stack

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

Personal site with two modes: an **AI mode** (RAG chat about Ivan with a live 2D vector-space background) and a **text mode** (CV). The repository is public and is itself part of the portfolio.

Constraints:
- AI mode JS ≤ 200 KB gzip in total;
- time to first token p50 < 2 s;
- €0 for fonts and other assets, minimal infrastructure and API spend (~$20 OpenAI balance at the start);
- Windows development machine;
- the owner is learning Python and builds the AI core himself in mentor mode (see [ADR-0007](0007-mentor-mode.md)).

Versions were checked on 2026-11-01 against npm, PyPI and official documentation. `UNVERIFIED` marks claims that could not be confirmed.

## Decision

### Repository and runtimes

| Layer | Choice | Version | License | Why / trade-off |
|---|---|---|---|---|
| Monorepo | pnpm workspaces, no Turborepo | pnpm 12.16.1 | MIT | One JS app plus one Python app. Turborepo orchestrates only JS tasks, so `pnpm -r` / `--filter` is enough. Turbo (2.11, MIT) can be added later without migration. |
| Node | 24 LTS (Maintenance until 2028-04-30) | 24.x | MIT | Already installed. Supported by every tool in the stack (Astro 7 needs ≥ 22.23.4, Vitest 5 accepts ^24). Node 26 is the Active LTS; there is no current reason to move. |
| Python | 3.13, pinned in `.python-version`, installed by uv | 3.13.x | PSF | The newest version that every dependency declares support for. langgraph, umap-learn and langchain-postgres do not declare 3.14 yet. |

### Frontend

| Layer | Choice | Version | License | Why / alternatives |
|---|---|---|---|---|
| Framework | Astro + React islands | astro 7.4.4, @astrojs/react 7.1.2, react 19.3.1 | MIT | See [ADR-0002](0002-frontend-framework.md). |
| Language | TypeScript strict + `noUncheckedIndexedAccess` | **6.0.3 (pinned)** | Apache-2.0 | TS 7.0.2 (native compiler) is `latest`, but typescript-eslint 8.72 (peer `<6.1.0`) and @astrojs/check 0.9.12 (peer `^5 \|\| ^6`) do not support it yet. Revisit when they do. |
| Styles | SCSS (`@use` / `@forward`), CSS custom-property tokens, BEM | sass 1.107.1 | MIT | BEM decided by the owner. `@import` is deprecated in Dart Sass. |
| Units | `rem` for `font-size` and `line-height` (fluid via `clamp()` on `rem`), `px` for borders, hairlines and shadows | — | — | Owner's decision. Respects the user's browser font size (WCAG 1.4.4). |
| CV source | One Markdown file per job / CV section with YAML frontmatter, in an Astro content collection with a Zod schema (`import { z } from 'astro/zod'`) | zod 4.6 (bundled with Astro) | MIT | `brief` comes from frontmatter, the full version from the body. The build fails on schema errors. The same files feed RAG ingestion. |
| CV PDF | Playwright `page.pdf()` of the built `/cv` page with print CSS, in CI | @playwright/test 1.64.1 | Apache-2.0 | The PDF is the same HTML, so there is no second template that can drift. |
| Chat Markdown | react-markdown + rehype-sanitize | 10.1.0 / 6.0.0 | MIT | Builds a React tree, renders no raw HTML by default, no `dangerouslySetInnerHTML`. 34 KB gzip (bundlephobia). Both packages are stable but release rarely. Rejected: markdown-it + DOMPurify (needs `dangerouslySetInnerHTML`); streamdown 2.7 (heavier, sanitization defaults UNVERIFIED). |
| Visualization | Hand-written SVG + CSS transforms. No d3 | — | — | See [ADR-0005](0005-visualization-rendering.md). Linear coordinate scaling is ~10 lines of reviewable code, so d3-scale (4.0.2, ISC, unchanged since 2023) is not needed. |
| Animations | CSS transitions, CSS scroll-driven animations, cross-document View Transitions (`@view-transition { navigation: auto }`) — all progressive enhancement | — | — | Scroll-driven: Chrome 115+, Safari / iOS 26+, Firefox 159+ (~88% global). Cross-document View Transitions: Chrome 126+, Safari / iOS 18.2+, Firefox partial. The native API needs 0 JS, so Astro `<ClientRouter>` is not used. |
| Mobile keyboard | `visualViewport` API (primary) + `interactive-widget=resizes-content` (bonus) | — | — | iOS Safari does **not** support `interactive-widget` (caniuse); Chrome Android 156+ does. |
| Fonts | Self-hosted OFL fonts via the Astro Fonts API (Fontsource or local provider) | Astro 7 | OFL-1.1 | No third-party font requests (GDPR). Stable since Astro 6; exact config fields UNVERIFIED, checked in Phase 1. |
| API types | FastAPI `openapi.json` → `openapi-typescript` (types) + `openapi-fetch` (REST client) | 7.13.0 / 0.17.0 | MIT | One source of truth. SSE events are a Pydantic discriminated union yielded as `AsyncIterable[ChatEvent]`, which FastAPI documents in OpenAPI. A contract test diffs the generated types in CI. Fallback if the union does not appear in OpenAPI: register the models as components explicitly. |

**JS budget estimate for AI mode.**

| Component | Approx. gzip |
|---|---|
| react + react-dom/client | ~60 KB (UNVERIFIED: bundlephobia measured only the entry stub) |
| react-markdown | 34 KB (measured) |
| chat + visualization code | ~25 KB |
| Astro island runtime | ~2 KB |
| **Total** | **~120 KB**, inside the 200 KB budget |

If the real build exceeds the budget, the first lever is `preact/compat` (preact 11.1.1, 5 KB gzip measured), which saves ~55 KB.

### Backend and AI

| Layer | Choice | Version | License | Why / alternatives |
|---|---|---|---|---|
| API | FastAPI with **native SSE** (`fastapi.sse.EventSourceResponse`), Pydantic v2, pydantic-settings, uvicorn | 0.162.0 / 2.14.2 / 2.16.2 / 0.54.0 | MIT / BSD | Native SSE has existed since 0.135, with built-in keep-alive ping and `X-Accel-Buffering: no`. sse-starlette is not needed. |
| Python tooling | uv, ruff (lint + format), **pyright strict** | 0.13.6 / 0.17.3 / 1.1.414 | MIT / Apache | Pyright is the engine behind Pylance in VS Code, so editor and CI report the same errors. Rejected: mypy 2.4 (equally fine, but its diagnostics differ from the editor's); ty 0.0.95 (pre-stable); poetry (uv is faster and manages Python itself). |
| LLM framework | LangChain 1.x + LangGraph 1.x, langchain-openai; langchain-anthropic added when switching providers | langchain 1.4.7, langgraph 1.2.19, langchain-openai 1.7.3, langchain-anthropic 1.7.7 | MIT | The provider and model come from config via `init_chat_model(model, model_provider=...)` (`from langchain.chat_models import init_chat_model`). Component roles: [ADR-0008](0008-langchain-langgraph-roles.md). |
| Router model | `gpt-6-luna`, `reasoning_effort=none`, structured output | — | — | $0.10 / $0.50 per 1M tokens (cached input $0.01). Supports structured output. `reasoning=none` matters for TTFT < 2 s, since the default is `medium`. |
| Answer model | `gpt-6.1-terra`, `reasoning_effort=none` | — | — | $1 / $5 per 1M tokens (cached input $0.05). Supports structured output and streaming. `gpt-6-luna` is the low-cost fallback; switching is a config change. Future Anthropic option: `claude-haiku-5-5` or `claude-sonnet-5-5`. |
| Embeddings | **text-embedding-3-large with `dimensions=1536`** | — | — | MIRACL multilingual 54.9 vs 44.0 for 3-small (full dimensions). Quality at 1536 dimensions is UNVERIFIED but expected to stay above 3-small. 1536 fits under pgvector's 2,000-dimension HNSW limit for `vector`. Cost is negligible at this corpus size. **Locked for the whole project**: changing the model requires full reindexing. |
| 2D projection | UMAP with a fixed `random_state`; PCA as a baseline | umap-learn 0.5.12, scikit-learn 1.9.1 | BSD | See [ADR-0006](0006-2d-projection.md). |
| Vector DB | PostgreSQL 18 + pgvector. Hybrid search = vector + Postgres FTS with RRF fusion via `PGVectorStore` + `HybridSearchConfig` | image `pgvector/pgvector:0.8.7-pg18-trixie`; langchain-postgres 0.0.19; pgvector-python 0.5.1 | PostgreSQL / MIT | See [ADR-0003](0003-vector-database.md). **Risk:** langchain-postgres is pre-1.0. |
| ORM and migrations | SQLAlchemy 2.1, Alembic. **Alembic owns every table**, including the vector table | SQLAlchemy 2.1.6, Alembic 1.20.1, psycopg 3.3.6 | MIT / LGPL-3.0 | One driver, psycopg 3 (sync and async). |
| Reranking | None in MVP | — | — | Probably unnecessary at this corpus size. Re-evaluated in the "RAG quality" work (Voyage rerank-3-lite $0.02/1M; Cohere price UNVERIFIED). |
| Evals | Own pytest suite + **DeepEval** metrics (faithfulness, answer relevancy) with a cheap judge model | deepeval 4.3.2 | Apache-2.0 | Active releases, pytest-native. RAGAS 0.4.3 rejected for now: no release since 2026-01. DeepEval telemetry must be disabled (exact env var UNVERIFIED). |
| Tracing | **Langfuse Cloud, EU region** (`cloud.langfuse.com`, Ireland), Hobby free tier, question text masked before export | langfuse 5.1.0 | MIT (SDK) | 50k units per month, 30-day retention. A `mask` function redacts or hashes question text, and secrets are never attached. Whether Hobby allows shorter retention is UNVERIFIED. Rejected: self-hosting (needs ClickHouse + Redis + S3, over 20 GB RAM); LangSmith (5k traces, 14-day retention). |
| Rate limiting | slowapi (in-memory, single instance) | 0.1.10 (2026-06) | MIT | Decorator API, easy to learn. Built on `limits` 5.8, which can be used directly if slowapi stalls. Rate limiting in Caddy would need a non-standard build. |
| Backend tests | pytest, pytest-asyncio (`asyncio_mode = "auto"`), pytest-cov, httpx AsyncClient | 9.2.0 / 1.4.1 / 7.1.0 / 0.28.1 | MIT / Apache | The `mentor_pending` marker is registered in the pytest config. |

### Quality, testing, security, infrastructure

| Layer | Choice | Version | License | Notes |
|---|---|---|---|---|
| JS lint | ESLint 10 (flat config) + typescript-eslint + eslint-plugin-astro + **eslint-plugin-jsx-a11y-x** + eslint-plugin-react-hooks | 10.14.0 / 8.72.1 / 3.2.1 / 0.2.0 / 7.1.1 | MIT | eslint-plugin-astro requires ESLint ≥ 10. The original eslint-plugin-jsx-a11y (6.10.2, last release 2024-10) supports only up to ESLint 9. **Risk:** the `-x` fork is young (0.2.0). |
| CSS lint | Stylelint + stylelint-config-standard-scss + stylelint-selector-bem-pattern + stylelint-declaration-strict-value | 17.16.0 / 17.0.0 / 5.0.0 / 1.12.1 | MIT | Covers `!important`, ID selectors, nesting depth, `transition: all`, `float`, `px` font sizes, BEM naming and token-only values. |
| Formatting | Prettier + prettier-plugin-astro; ruff format | 3.9.10 / 1.1.2 | MIT | — |
| Frontend unit and component tests | Vitest + Testing Library + user-event, jsdom | 5.0.5 / 16.3.3 / 14.6.8 / 30.1.3 | MIT | jsdom over happy-dom for compatibility. |
| E2E, visual and a11y tests | Playwright (Chromium for CDP CPU throttling, WebKit for the iPhone profile) + @axe-core/playwright | 1.64.1 / 4.14.0 | Apache-2.0 / MPL-2.0 | CPU throttling via CDP is Chromium-only, so the "weak Android" profile runs on Chromium. |
| Performance | Lighthouse CI with mobile and desktop budgets | @lhci/cli 0.15.1 | Apache-2.0 | **Known trade-off:** last npm release 2025-06, and it bundles Lighthouse 12.6 while 13.6 is current. The repository is still active. Fallback: run `lighthouse` 13 directly with a small budget script. |
| Security | gitleaks, pnpm audit, pip-audit | 8.30.1 / — / 2.10.1 | MIT / Apache | gitleaks via winget locally and its GitHub Action in CI. |
| Git hooks | lefthook | 2.2.2 | MIT | One config for JS and Python, installed via pnpm, works natively on Windows. Rejected: pre-commit (Python-centric, slower on Windows); husky (JS only). |
| Containers | Docker multi-stage, non-root; Compose services `web`, `api`, `db` | `python:3.13-slim-bookworm`, `node:24-*` (build stage), `pgvector/pgvector:0.8.7-pg18-trixie`, `caddy:2.11-alpine` | — | Pinned tags. The DB is reachable only on the internal Compose network. |
| Proxy | Caddy: auto HTTPS, `flush_interval -1` for SSE, security headers, zstd / gzip, immutable caching for hashed assets | 2.11.7 | Apache-2.0 | Nginx rejected: manual TLS setup. |
| CI/CD | GitHub Actions, images in GHCR | — | — | `mentor_pending` tests are reported separately and do not fail CI. |
| Analytics | None. Anonymous chat statistics stored in Postgres | — | — | Self-hosted Umami is in the backlog. |

### Claude Code tooling (minimal set)

| Item | Source | License / version | Why |
|---|---|---|---|
| MCP: Context7 | github.com/upstash/context7 | MIT, 4.4.4 | Current library docs, for the "verify, don't trust memory" rule. Configured at Ivan's **user** scope (`npx -y @upstash/context7-mcp`), not in `.mcp.json`, to avoid a scope conflict (decided 2026-11-01). Optional free API key. |
| MCP: Chrome DevTools | github.com/ChromeDevTools/chrome-devtools-mcp | Apache-2.0, 1.12.0 | Performance traces and CPU / network throttling for the visualization. Unused tool groups are trimmed to save context. |
| Playwright CLI + its skill (instead of Playwright MCP) | github.com/microsoft/playwright-cli | Apache-2.0, 0.1.23 | Snapshots go to files, not into the context; both Microsoft READMEs recommend the CLI for coding agents. Installed as a project devDependency, not globally. |
| Plugin: frontend-design | anthropics/claude-plugins-official | Apache-2.0, pinned to sha `41bbe19` | There is no design yet; it sets an aesthetic direction before code is written. No conflicts with our rules: it mandates no fonts, Tailwind or JS animation libraries. |
| Impeccable (deferred to Phase 7) | github.com/pbakaus/impeccable | Apache-2.0, cli-v4.8.0 | Audit and polish. **`overdrive` is banned** (GSAP / Three.js / WebGL). Our rules override `craft-floor` (it suggests animating blur and mask). Our constraints go into its DESIGN.md. |
| Postgres MCP Pro, restricted mode (enabled in ROADMAP 3.1) | github.com/crystaldba/postgres-mcp | MIT, 0.3.0 | Read-only DB inspection of the **local dev** database. `.mcp.json` runs `uvx --from postgres-mcp==0.3.0 postgres-mcp --access-mode=restricted`; the URL comes from `POSTGRES_MCP_DATABASE_URI` in the user's environment (default: the dev DB on 127.0.0.1 without a password), never a production URL. |
| Rejected | — | — | taste-skill (GSAP, Google / Fontshare fonts, "8+ moving elements"); animation skills (GSAP / Three.js); Playwright MCP (context cost); GitHub MCP (`gh` CLI is enough); `@modelcontextprotocol/server-postgres` (deprecated); Figma MCP (no Figma). |
| Subagents | `.claude/agents/` | — | Now: `frontend-reviewer` (sonnet), `python-reviewer` (sonnet, mentor tone, read-only), `security-reviewer` (sonnet), `test-runner` (haiku, failures-only summary). Later: `rag-evaluator` (Phase 4), `mobile-qa` (Phase 7). The built-in Explore agent runs on the session model, not Haiku, so every delegated search sets `model` explicitly. |
| Output style | Custom `.claude/output-styles/mentor.md` (`keep-coding-instructions: true`), enabled with `/output-style mentor` for mentor sessions | — | The built-in Learning style writes code around `TODO(human)` markers, which breaks the mentor rule. Output styles apply to the whole session, so the path-scoped `.claude/rules/mentor-mode.md` stays as the safety net. |
| Advisor | `/advisor opus` with a Sonnet main model | Claude Code 2.1.316 | Verified. Experimental, Anthropic API only. |

Rule precedence: when a third-party skill conflicts with `.claude/rules/`, the rules win. This is stated in `CLAUDE.md`.

## Cost estimate (OpenAI Standard tier, prices as of 2026-11-01)

| Item | Estimate |
|---|---|
| Ingestion: corpus ~150k tokens with 3-large | ~$0.02 per full reindex |
| Query embedding | ~$0.000005 per question |
| Router (luna, ~400 in / 20 out) | ~$0.00005 per question |
| Answer (terra, ~4.5k in / 400 out) | ~$0.0065 per question → **~3,000 answers per $20** |
| Eval run (~40 cases, terra answers + 2 judge metrics) | ~$0.5–1 per run, estimated before every run |
| Langfuse Hobby, GitHub Actions (public repo), GHCR | $0 |
| VPS in the EU (2 vCPU / 4 GB is enough) | ~€4–6 per month (UNVERIFIED, priced in Phase 8) |
| `.com` domain | ~€10–15 per year (UNVERIFIED) |

A hard spend limit is set on the OpenAI project (requests then fail with HTTP 429 `project_spend_limit_exceeded`; enforcement is not instantaneous).

## Consequences

- Pinned exceptions to "latest": TypeScript 6.0.3 (revisited when upstream catches up). Lighthouse 12.6 via LHCI was replaced by `lighthouse` 13.5.0 (amendment of 2026-11-02 below).
- Pre-1.0 dependencies on the critical path: langchain-postgres 0.0.19 and eslint-plugin-jsx-a11y-x 0.2.0. Each has a recorded fallback.
- Every model ID, price, temperature and token limit lives in config, not in code.
- **Correction (2026-11-01, Stage 5):** frontend-design is not pinned to a commit sha. It is installed from the `claude-plugins-official` marketplace as plugin **version 1.1.1** at project scope (`enabledPlugins` in `.claude/settings.json`). Updates arrive when the marketplace is refreshed. Plugin updates are reviewed before they are accepted, and the version in use is recorded here.
- **Amendment (2026-11-01, Stage 6 steps 3–4) — status: Accepted by Ivan on 2026-11-01.** Lint additions, all checked on npm on 2026-11-01:

  | Package | Version | License | Why |
  |---|---|---|---|
  | @eslint-community/eslint-plugin-eslint-comments | 4.8.1 | MIT | `require-description` on every `eslint-disable` comment (typescript.md). |
  | stylelint-use-logical | 2.1.3 (peer `stylelint <18`) | CC0-1.0 | Enforces logical properties (css-scss.md). Last release 2026-02; if it stalls, the rule falls back to `[review]`. |
  | postcss-html | 2.0.0 | MIT | Lets Stylelint lint `<style>` blocks inside `.astro` files. |
  | @eslint/js, globals | 10.0.1 / 17.13.0 | MIT | Standard parts of an ESLint flat config. `globals` is held at 17.13.0 because 17.14.0 was released the same day and pnpm's minimum release age policy blocks it; no exclusion was added. |

  | @vitest/eslint-plugin | 1.6.28 | MIT | `no-focused-tests` / `no-disabled-tests` (testing.md: never weaken a red test). |
  | @vitest/coverage-v8 | 5.0.5 | MIT | Coverage for the ≥ 70% frontend-logic guidance (TESTING.md). |
  | @testing-library/dom, @types/node | 10.4.2 / 24.19.2 | MIT | Peer of @testing-library/react; Node 24 types for config files and E2E. |

  Rejected: **eslint-plugin-import-x** (+ its TypeScript resolver): the only rule needed, "no default exports", is covered by core `no-restricted-syntax`.

  Playwright device profiles: **iPhone 17 Pro Max** (WebKit, no throttling: CDP is Chromium-only) and **Galaxy S24** (Chromium, 360 px wide, Slow 4G + 4× CPU via CDP `Network.emulateNetworkConditionsByRule`, which replaces the deprecated `Network.emulateNetworkConditions`).
- **Amendment (2026-11-01, Stage 6 step 6) — status: Accepted by Ivan on 2026-11-01.**
  - **gitleaks in CI** runs as the official release binary (8.30.1, sha256 pinned in the workflow) instead of `gitleaks/gitleaks-action`. That action needs a paid license for organization accounts, and it would be one more third-party action with repository access. Same binary and rules as the pre-commit hook. The CI scan covers the **whole history** (`fetch-depth: 0`). Pull requests are scanned with the **base branch's** `.gitleaks.toml`, without `.gitleaksignore` and inline `gitleaks:allow`, so a PR cannot weaken its own scan.
  - **pip-audit** (2.10.1) is an `apps/api` dev dependency, so it and its own dependencies are hash-locked in `uv.lock`.
  - **`check-fast.mjs --strict`** in CI: a missing app marker fails the job instead of being skipped.
  - **Phone-number rules** in `.gitleaks.toml` (golden rule 5) with test vectors in `scripts/gitleaks-rules.test.mjs`, run against the real binary.
  - **Commit messages** are checked by a dependency-free `scripts/check-commit-msg.mjs` instead of commitlint (one regular expression).
  - **`pnpm audit` policy:** production dependencies at `high` or above block CI. Dev dependencies are reported as a warning only. Reason: on 2026-11-01 all 8 advisories (5 high) are in dev tooling, 7 of them via `@lhci/cli`'s outdated transitive dependencies (the trade-off recorded above), and `extract-zip` has no patched version. Revisit when LHCI is replaced by `lighthouse` 13 (the recorded fallback). `pip-audit` audits the locked Python dependencies and blocks.
  - GitHub Actions, pinned by SHA: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `pnpm/action-setup` v6.1.0, `astral-sh/setup-uv` v10.3.3 (all on the node24 runtime).
- **Amendment (2026-11-02, ROADMAP 1.4–1.8) — status: Proposed (Ivan pre-approved routine stages; to be confirmed with the batch commit).**
  - **Lighthouse:** `@lhci/cli` 0.15.1 is replaced by `lighthouse` **13.5.0** (Apache-2.0, released 2026-09-18; 13.6.0 from 2026-10-27 was too new to adopt) run by `apps/web/scripts/lighthouse.mjs`. It serves `dist/` with gzip, runs each page 3 times per profile in Playwright's Chromium, and checks the same budgets on the median (`pnpm --dir apps/web run lighthouse`). The 12.6 exception to "latest" is gone.
  - **`pnpm audit` policy (revisited):** without LHCI, 7 of the 8 dev advisories are gone. The remaining one is a moderate `minimatch` advisory, reached only by linters and the type generator through glob patterns, so dev dependencies now **block CI at `high`** like production ones.
  - **CI jobs added:**
    - `e2e`: Playwright desktop, iPhone / WebKit and throttled Android, plus axe;
    - `visual`: snapshots in `mcr.microsoft.com/playwright:v1.64.1-noble`; it warns until Linux baselines exist;
    - `lighthouse`;
    - `contract`: the OpenAPI types are not stale (ROADMAP 1.5);
    - `infra`: Compose / Dockerfile checks, the image build, an image scan, a `docker compose up` smoke test and a header check (ROADMAP 1.6).

    A `deploy` workflow builds, scans and pushes the images to GHCR and deploys over SSH, without third-party actions (ROADMAP 1.7).
  - **API dependencies (ROADMAP 1.4), pinned as in the table:**
    - runtime: `fastapi` 0.162.0 without extras, `uvicorn[standard]` 0.54.0, `pydantic-settings` 2.16.2, `sqlalchemy[asyncio]` 2.1.6, `psycopg` 3.3.6 (pure Python with the system libpq in the image);
    - dev: `psycopg-binary` 3.3.6, `fastapi-cli` 0.0.32, `httpx` 0.28.1.
  - **Web additions:**
    - `openapi-typescript` 7.13.0 (types, ROADMAP 1.5);
    - Fontsource font packages (ADR-0010);
    - Astro `security.csp` for a hash-based CSP `<meta>` (no new dependency).
- **Amendment (2026-11-04, ROADMAP 3.2) — status: Accepted by Ivan on 2026-11-04** (he chose both options in chat). Ingestion loaders:
  - **`pyyaml` 6.0.3** (MIT, 2025-09-25) parses the YAML frontmatter of the CV collection and `data/*.md` with `yaml.safe_load`, behind a ~10-line `split_frontmatter` helper. Rejected: `python-frontmatter` (one more wrapper over PyYAML for one regex). Dev: **`types-pyyaml` 6.0.12.20260906** for pyright strict (the newest release older than two weeks).
  - **`langchain-core` 1.7.0** (MIT, 2026-10-22) is added explicitly because the loaders return `langchain_core.documents.Document`, the type the Markdown splitter (3.3) and `PGVectorStore` (3.6) consume ([ADR-0008](0008-langchain-langgraph-roles.md)). It satisfies the declared ranges of langchain 1.4.7 (≥ 1.6.13) and langchain-openai 1.7.3 (≥ 1.7.0). Rejected: an own `SourceDocument` dataclass (stricter types, but a conversion at every LangChain boundary).
  - Frontmatter is validated with Pydantic models (`extra="forbid"`), mirroring the strict Zod schema of the CV collection: an unexpected key such as `phone` fails ingestion.
- pnpm 12 denies dependency install scripts unless they are listed in `allowBuilds` (`pnpm-workspace.yaml`). `@parcel/watcher` (via sass) is set to `false`: its script only compiles from source when no prebuilt binary exists.
- Follow-up ADRs: 0002 frontend framework, 0003 vector database and schema ownership, 0004 guardrails, 0005 visualization rendering, 0006 2D projection, 0007 mentor mode, 0008 LangChain / LangGraph roles.
