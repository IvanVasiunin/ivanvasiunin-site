# Roadmap

- **Status:** Draft for review
- **Last updated:** 2026-11-01

## How to read this

- **Zones** ([ADR-0007](adr/0007-mentor-mode.md)):
  - **C** — Claude writes, Ivan reviews line by line;
  - **M** — mentor zone: Ivan writes, Claude writes failing tests, gives hints and reviews;
  - **I** — Ivan only: accounts, keys, purchases, decisions.
- **Step size:** every task is split into review steps of ≤ ~300 diff lines. Each step comes with a report (what and why, alternatives, "what to check", checks run) and waits for Ivan's OK.
- **Global Definition of Done:** applies to every task in addition to its own DoD:
  - fast checks are green;
  - the checks required by the [TESTING](TESTING.md) change-type table are green;
  - docs are updated where behaviour changed.
- **Public access to the chat** is not opened before Phase 4 is complete.

---

## Phase 0 — Setup (current)

Stack, docs, rules, Claude Code configuration, empty skeleton with all checks green. See [phase-0-setup.md](phase-0-setup.md).

## Phase 1 — Skeleton and "hello world" deployment

| # | Task | Zone | DoD |
|---|---|---|---|
| 1.1 | Base page shell: layout, design tokens (colour, spacing, type scale in `rem`, durations, easing, z-index), cascade layers, light / dark theme with toggle and no flash | C | Tokens documented; theme toggle e2e and axe green; visual snapshots at 360 / 768 / 1440 in both themes |
| 1.2 | Mode switcher (SPEC §2, Q1) between `/` and `/cv` placeholders, cross-document View Transitions | C | Keyboard e2e; works without JS; reduced motion respected |
| 1.3 | Self-hosted OFL fonts via the Astro Fonts API; `docs/CREDITS.md` entries | C | No third-party requests (e2e asserts); CLS < 0.1 |
| 1.4 | FastAPI app: `/api/health`, settings, structured logging, unified error format, CORS | C | pytest + httpx contract tests; 80% coverage of `core/` |
| 1.5 | OpenAPI → TS type generation + CI staleness check | C | CI fails on stale types (demonstrated) |
| 1.6 | Dockerfiles (multi-stage, non-root, pinned, healthchecks), Compose `web` / `api` / `db`, Caddyfile (headers, compression, SSE flush). From the 1.4 security review: build `psycopg[c]` against the image's libpq instead of `psycopg[binary]` (or record the choice in an ADR); uvicorn with `--proxy-headers --forwarded-allow-ips=<compose subnet> --no-server-header`, `api` port not published; decide whether `/api/health` is exposed through Caddy or only used by the Compose healthcheck | C | `docker compose up` locally green; `security-reviewer` passed |
| 1.7 | VPS rented, DNS (or a temporary subdomain), deploy job from GHCR | I + C | Hello-world page on HTTPS; health endpoint reachable; RUNBOOK deploy section filled |
| 1.8 | Replace `@lhci/cli` with `lighthouse` 13 + a small budget script (ADR-0001 fallback; removes 7 of 8 dev-dependency advisories); add e2e + Lighthouse jobs to CI | C | `pnpm audit` (dev) clean of LHCI advisories; mobile / desktop budgets enforced in CI; ADR-0001 updated |

## Phase 2 — Text mode (CV)

| # | Task | Zone | DoD |
|---|---|---|---|
| 2.1 | CV content collection schema (Zod) | C | Build fails on invalid frontmatter (tested) |
| 2.2 | Draft the structured CV from the Word CV + `experience-notes.md`; **no phone number** | C → I review | Ivan approved the content; a test asserts no phone pattern in the sources |
| 2.3 | `/cv` page: semantic markup, JSON-LD `Person`, meta / OG | C | axe green; Lighthouse mobile ≥ 95 in all four categories |
| 2.4 | Brief / Full switch (`aria-pressed`, `?view=`), Full without JS | C | Vitest + e2e (with JS disabled too) |
| 2.5 | Print styles + build-time PDF via Playwright | C | Print visual snapshot; PDF generated in CI; the secondary-button e2e checks in `e2e/layout.spec.ts` restored on the "Download PDF" link |
| 2.6 | Layout details: scroll-driven animations, View Transitions polish (`@supports`) | C | Works and degrades in Firefox / older Safari profiles; reduced motion respected |

## Phase 3 — RAG MVP

| # | Task | Zone | DoD |
|---|---|---|---|
| 3.1 | Alembic setup + `chunks` table migration (ADR-0003); Postgres MCP (restricted) enabled | C (Ivan reviews the table design) | Migration up / down tested |
| 3.2 | Ingestion: loaders + metadata for CV, experience notes, personal facts, site docs | **M** | Tests (written by Claude) green; explain-back done |
| 3.3 | Chunking strategy (heading-aware) + documentation in ARCHITECTURE | **M** | Chunk-shape tests green; strategy documented |
| 3.4 | Embeddings + idempotent upsert by `content_hash` | **M** | Re-run makes zero embedding calls (mocked test) |
| 3.5 | GitHub README ingestion (allow-list, `type=github_readme`); create the `add-rag-source` skill (new source → metadata → reindex + projection → eval cases) | **M** (ingestion) / C (skill) | Allow-list enforced by test; skill documented |
| 3.6 | Hybrid retrieval (vector + FTS, RRF) + per-project deduplication | **M** | Retrieval tests on a fixture corpus |
| 3.7 | Generation node with streaming; provider switch via config (test) | **M** | OpenAI ↔ Anthropic switch test (mocked) green |
| 3.8 | `/api/chat` SSE endpoint wiring `route` → `token` → `done` / `error`. Until the router exists (4.2), `route` is always `about_ivan` | C | SSE contract tests for every event type |
| 3.9 | Chat UI island: input, Enter / Shift+Enter, streaming, Stop, Retry, Copy, autoscroll, example questions, empty / loading / error states, AI disclosure, mobile keyboard handling; below `md` the input coexists with the floating mode switch at the bottom (input above the bar, or the bar hidden while the input has focus / the keyboard is open); `/` may be prerendered (ADR-0009), so API calls, analytics, autofocus and the `?q=` prefill wait until `document.prerendering` is false | C | Vitest component states; e2e on a mocked LLM (desktop + mobile); axe green; JS budget checked |

## Phase 4 — Guardrails, evals, tracing

| # | Task | Zone | DoD |
|---|---|---|---|
| 4.1 | Input guard + slowapi limits + session limits | C (limits) / **M** (graph node) | API tests for every limit and error code |
| 4.2 | Router node: structured output, classes, language, localized templates (EN / ES / RU / UK) | **M** | Unit tests with a mocked LLM green |
| 4.3 | Relevance gate + "no information" template | **M** | Unknown-fact tests green |
| 4.4 | System prompt (versioned file) implementing SPEC §5; create the `prompt-change` skill (edit prompt → cost estimate → evals → compare → record) | **M** (prompt) / C (skill) | Prompt reviewed against the policy checklist |
| 4.5 | Eval suite: six case types, multilingual, thresholds in config; cost estimate before each run; `rag-evaluator` subagent | **M** (cases, metrics) / C (runner, subagent) | First baseline run recorded, with its cost |
| 4.6 | Langfuse (EU) with masking; chat statistics table + retention job | C (wiring) / **M** (masking rules) | No unmasked question in a captured trace (test); retention tested |
| 4.7 | Privacy notice `/privacy` | C → I review | Ivan approved the wording |

**Gate:** after Phase 4 the chat may be opened publicly.

## Phase 5 — Under the hood

| # | Task | Zone | DoD |
|---|---|---|---|
| 5.1 | Per-node timing and token accounting; cost from the config price table; `sources` and `usage` events | **M** (graph) / C (event serialization) | SSE contract tests for `sources` and `usage` |
| 5.2 | Under the hood panel (`aria-expanded`, keyboard), allow-list rendering | C | Component tests; e2e; test that no system-prompt text can appear |
| 5.3 | Source references in answers (links) | C | e2e |

## Phase 6 — Vector space

| # | Task | Zone | DoD |
|---|---|---|---|
| 6.1 | UMAP projection, normalization, stability policy (ADR-0006), `points.json` export | **M** | Determinism test; stability test (unchanged chunks keep coordinates); JSON ≤ 50 KB gzip |
| 6.2 | SVG visualization prototype on mock data: drift, legend, colours per source type, pause logic, reduced motion | C | Unit tests for scaling / intensity; screenshots in both themes |
| 6.3 | Highlight on `sources` events (CustomEvent bridge) | C | e2e: points highlighted after an answer; ids match the contract |
| 6.4 | Light mode for weak devices + long-frame detection; create the `perf-check` skill (Lighthouse mobile / desktop, long frames, budgets) | C | Test that light mode switches on; long-frame measurement at 4× / 6× CPU |
| 6.5 | **Decision gate** (ADR-0005) | I | Ivan's decision recorded; a new ADR if SVG fails |

## Phase 7 — Polish, audits

| # | Task | Zone | DoD |
|---|---|---|---|
| 7.1 | ~~"Ask about this" links on jobs and skill groups~~ — **dropped** (Ivan, 2026-11-07; SPEC US-T3) | — | — |
| 7.2 | Impeccable install (pinned, `overdrive` banned) + audit / polish pass; `mobile-qa` subagent | C | Audit findings triaged; fixes merged in small steps |
| 7.3 | Full a11y audit (axe + keyboard + screen-reader spot checks) | C | Zero serious / critical findings |
| 7.4 | Performance audit against every budget; Chrome DevTools traces of the visualization | C | All budgets green in the Lighthouse job |
| 7.5 | Real-device check on iPhone 17 Pro Max (Safari, keyboard, safe area, dark theme) + emulated weak Android at 6× CPU — **moved after launch** (Ivan, 2026-11-08): the emulated devices in e2e are enough before release; real devices are checked on production | I + C | Results logged in TESTING.md |

## Phase 8 — Launch

| # | Task | Zone | DoD |
|---|---|---|---|
| 8.1 | Buy `ivanvasiunin.com`, DNS, final Caddy config | I + C | HTTPS A+ on an SSL test; HSTS on |
| 8.2 | VPS hardening per RUNBOOK checklist | I (with Claude's guidance) | Checklist ticked |
| 8.3 | Backups (`pg_dump` schedule) + restore drill | C + I | Restore tested and documented |
| 8.4 | OpenAI spend limit + Langfuse alerts verified; key rotation procedure | I | RUNBOOK updated |
| 8.5 | README for the public repo; this repo added to the GitHub allow-list and re-ingested | C + I | Repo public; the assistant can answer "how is this site built?" |
| 8.6 | Open Graph image (1200×630, `og:image` + `twitter:image`, `twitter:card` → `summary_large_image`) for `/` and `/cv` | C, Ivan reviews | Link previews show the image in the Telegram / LinkedIn debuggers |

## Backlog

- Self-hosted Umami analytics.
- Reranking (Voyage / Cohere), if evals show a need.
- Switch to Anthropic models (config + `langchain-anthropic`, with an eval comparison).
- Cloud real-device testing service (see TESTING.md).
