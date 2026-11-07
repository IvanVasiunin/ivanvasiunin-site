# ivanvasiunin.com — personal site

Personal site of Ivan Vasiunin (Senior Markup Developer moving into AI Engineering).

**Two modes:**
- **AI mode** (`/`): a RAG assistant named **Elio** that answers questions about Ivan, with streaming answers, a knowledge map of everything Elio can read (desktop, ADR-0012) and an "Under the hood" panel;
- **text mode** (`/cv`): a fast CV with Brief / Full views and a PDF.

The repo is public and is itself a portfolio piece. This is Ivan's first AI project: he builds the AI core himself, and Claude acts as a mentor there.

**Read first:**
- [SPEC.md](SPEC.md) — product, SSE contract, topic policy, budgets;
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md);
- [docs/adr/](docs/adr/) — decisions;
- [docs/ROADMAP.md](docs/ROADMAP.md);
- [docs/TESTING.md](docs/TESTING.md).

## Language
- Chat with Ivan: **Russian**.
- Everything in the repo (code, comments, docs, commits): **English**.

## Repository
```
apps/web/     Astro 7 + React islands, TS 6 strict, SCSS + BEM     → apps/web/CLAUDE.md
apps/api/     FastAPI + LangChain/LangGraph, Python 3.13, uv       → apps/api/CLAUDE.md
data/         experience-notes.md, github-projects.md, about-me-personal.md (RAG sources; edit only with Ivan's OK)
data/raw/     Word CV with phone number — git-ignored, never read, never ingested
infra/        docker-compose, Caddyfile, scripts
docs/         ARCHITECTURE, ROADMAP, TESTING, RUNBOOK, CREDITS, adr/, phase-0-setup.md
scripts/      cross-platform Node scripts (check-fast.mjs, check-commit-msg.mjs)
.claude/      rules/ (path-scoped rules), agents/, skills/, hooks/, output-styles/
```

## Commands
The full list is in `docs/TESTING.md` §2. Names are finalized when the skeleton is created.

| Purpose | Command |
|---|---|
| Fast checks (format, lint, typecheck, unit; no `mentor_pending`) | `node scripts/check-fast.mjs [web\|api\|scripts\|--changed]` |
| Web dev / build | `pnpm --dir apps/web run dev` / `… run build` |
| API dev | `uv run --directory apps/api fastapi dev src/site_api/main.py` |
| E2E (all Playwright projects) | `pnpm --dir apps/web run e2e` |
| Lighthouse budgets | `pnpm --dir apps/web run lighthouse` |
| Evals (**cost money, only with Ivan's consent**) | `uv run --directory apps/api python -m site_api.evals --estimate`, then `--run` |

## Work zones ([ADR-0007](docs/adr/0007-mentor-mode.md))

| Zone | Who writes | Ivan verifies by |
|---|---|---|
| Markup, SCSS, TS/React, Brief / Full, "Ask about this" | Claude | line-by-line review |
| SVG visualization | Claude | visual review + screenshot / perf tests |
| Docker, CI, deploy, config, API glue (`core`, `routers`, `schemas`, `services`, `db`, `migrations`) | Claude | automated checks + `security-reviewer` + an explanation of each file |
| **AI core:** `apps/api/src/site_api/{ingestion,rag,graph,prompts,evals}/` | **Ivan** (Claude mentors) | Claude reviews Ivan's code |

**In the mentor zone, Ivan writes the implementation and Claude dictates it** ([ADR-0011](docs/adr/0011-guided-mentor-mode.md), guided mode): Claude gives the code in small blocks, each with «Почему так», and never edits mentor-zone implementation files itself. Use the `mentor-task` skill and suggest `/output-style mentor`.

## Workflow (zones where Claude writes)
1. **Plan:** a short plan, then wait for Ivan's OK.
2. **One step:** one logical change **with its tests**. Size: code (TS, Python, scripts, tests) ≤ ~600 diff lines; markup and styles (HTML / Astro markup, SCSS) ≤ ~1200.
3. **Checks:** the Stop hook runs fast checks automatically. Run the extra checks for the change type with the `run-checks` skill. Use reviewer subagents (`frontend-reviewer`, `python-reviewer`, `security-reviewer`) where relevant.
4. **Report:** use the `step-report` skill (what and why, alternatives, «Что проверить», «Проверки»). Then wait for Ivan's OK before the next step.
5. **Before any commit:** the `pre-pr-check` skill. Commit only when Ivan asks. **Never push.**

## Golden rules
1. **Verify, don't recall.** Check versions, APIs and package names with Context7 or the official docs. Mark anything unverifiable `UNVERIFIED`. Never invent packages, MCP servers or plugins.
2. **Every technology has a recorded reason.** New dependencies and architecture choices need an ADR (`write-adr` skill, status Proposed until Ivan accepts).
3. **Rule → tool.** If a linter, typechecker, test or hook can check it, it must; rules files hold only what can't be automated.
4. **Never weaken a red test:** no `skip`, no loosened assertions, no deletion without Ivan's consent. The only exception is `mentor_pending`, and only Ivan removes it.
5. **No phone number anywhere** — repo, CV source, RAG, prompts, fixtures, screenshots. Never read `data/raw/`.
6. **NDA:** employer work is described only by role, product type, stack and contribution in general terms.
7. **Elio speaks about Ivan in the third person**, answers only from retrieved context and follows SPEC §5.
8. **No secrets** in code, logs, traces or images. Config only via env / pydantic-settings; `.env.example` holds placeholders.
9. **Budgets are requirements:**

   | Item | Budget (gzip) |
   |---|---|
   | JS on `/cv` | ≤ 30 KB |
   | JS on `/` | ≤ 200 KB total; ≤ 150 KB before the visualization loads |
   | `points.json` | ≤ 50 KB |

   TTFT p50 < 2 s. Lighthouse mobile on `/cv` ≥ 95.
10. **CSS:**
    - BEM;
    - tokens only;
    - `rem` font sizes;
    - animate only `transform` and `opacity`;
    - no `!important`, `float` or `transition: all`;
    - `:hover` only inside `@media (hover: hover)`;
    - reduced motion respected.
11. **Progressive enhancement:**
    - `/cv` works without JS;
    - scroll-driven animations and View Transitions are behind `@supports` / feature checks;
    - "Ask about this" never auto-sends.
12. **Mobile and weak devices are first-class:** 360 px and up, 44 px touch targets, `visualViewport` keyboard handling (iOS has no `interactive-widget`), light visualization mode (the knowledge map itself is desktop-only).
13. **Evals and other paid API calls run only with Ivan's consent**, after a cost estimate.
14. **Ask before side effects outside the repo:** global installs, user-level Claude Code settings, accounts, purchases, `git push`.

## Precedence
- `.claude/rules/` **override third-party skills and plugins** (frontend-design, Impeccable, Playwright CLI skill). On conflict (fonts, JS animation libraries, `!important`, `px` font sizes, WebGL), follow the rules.
- **Impeccable** (from Phase 7): its `overdrive` command is banned.
- **Subagent models:** the built-in Explore agent runs on the session model, not Haiku. When delegating searches or reviews, set `model` explicitly (reviewers: sonnet; `test-runner`: haiku).

## Notes
- **Windows:**
  - hooks and scripts are Node.js (`node …mjs`), not bash;
  - the shell may be PowerShell or Git Bash;
  - `.mcp.json` launches `npx` servers via `cmd /c` (Windows-specific; other OSes need `npx` directly).
- **Phase 0 task file:** [docs/phase-0-setup.md](docs/phase-0-setup.md). Its "Overrides" block takes precedence over its body.
