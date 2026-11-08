# ivanvasiunin.com

Personal site of Ivan Vasiunin, a Senior Markup Developer growing in AI Engineering.

- **AI mode** (`/`): **Elio**, a RAG assistant that answers questions about Ivan from his notes, with streaming answers, a live 2D map of the vector space and an "Under the hood" panel.
- **Text mode** (`/cv`): a fast CV with Brief and Full views and a PDF version.

> **Status:** Phase 0 (setup). No features yet. See the [roadmap](docs/ROADMAP.md).

## Stack

Astro + React islands, TypeScript, SCSS · FastAPI, LangChain / LangGraph, PostgreSQL + pgvector · Playwright, Vitest, pytest, Lighthouse. Every choice has a recorded reason in [docs/adr/](docs/adr/).

## Repository

```
apps/web/   frontend (Astro + React islands)
apps/api/   backend (FastAPI + LangGraph, ingestion, evals)
data/       RAG source notes
docs/       architecture, roadmap, testing, runbook, ADRs
infra/      deployment (Phase 1)
scripts/    cross-platform helper scripts
```

## Getting started

Requirements: Node 24, pnpm 12, [uv](https://docs.astral.sh/uv/), [gitleaks](https://github.com/gitleaks/gitleaks) (used by the pre-commit hook).

```sh
pnpm install                  # also installs the git hooks (lefthook)
uv sync --directory apps/api  # Python 3.13 + backend dev tools
cp .env.example .env          # placeholders; real keys stay local
node scripts/check-fast.mjs   # format, lint, typecheck, unit tests
```

More commands: [docs/TESTING.md](docs/TESTING.md).

## How this repo is built

The AI core (ingestion, retrieval, graph, prompts, evals) is written by Ivan as a learning project, with Claude Code as a mentor. Everything else is written with Claude Code and reviewed by Ivan. See [ADR-0007](docs/adr/0007-mentor-mode.md).

## License

Code: [MIT](LICENSE). Personal content (`data/`, the CV, photos): © Ivan Vasiunin, see [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
