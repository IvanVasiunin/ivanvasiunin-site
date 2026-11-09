---
name: add-rag-source
description: Adds a new knowledge source to Elio's RAG (a data/*.md file, a CV entry, a site doc or an allow-listed GitHub README) — content approval, metadata, loader and tests, reindex with a cost estimate, 2D projection, and eval cases. Use whenever a new source or a new kind of source should reach the knowledge base.
---

# Add a RAG source

Ingestion is the mentor zone ([ADR-0007](../../../docs/adr/0007-mentor-mode.md)): new loader code is written by Ivan, or by Claude only when Ivan explicitly asks. Content and allow-list changes are Ivan's decisions. Pipeline overview: [ARCHITECTURE §5](../../../docs/ARCHITECTURE.md).

## 1. Content approval (always Ivan)
1. Ask Ivan for an explicit OK on the text that Elio will learn. Files in `data/` change only with his OK (CLAUDE.md).
2. Check it against the rules before anything is ingested:
   - **no phone number** (golden rule 5); fetched text is redacted by `ingestion/pii.py`, repository files must simply not contain one;
   - **NDA** (golden rule 6): employer work only as role, product type, stack and general contribution;
   - **personal facts** belong in `data/about-me-personal.md` only (`category: personal`, SPEC §5.3);
   - **study projects** are labelled as study projects (SPEC §5.2).

## 2. Pick the kind of source

| Kind | Where | What to set |
|---|---|---|
| Hand-written notes | `data/<name>.md` (never `data/raw/`) | frontmatter `title`, `category` (`experience` / `personal`), `source`, optional `updated` |
| CV entry | `apps/web/src/content/cv/` | the Zod schema (`src/lib/cv/schema.ts`) **and** the Pydantic mirror (`ingestion/cv_models.py`) |
| Site doc | `SPEC.md`, `docs/ARCHITECTURE.md`, `docs/adr/NNNN-*.md` | a `# ` title; numbered ADRs are picked up automatically |
| GitHub README | `github_readmes` in `core/config.py` (or `GITHUB_READMES` in `.env`) | `repo` (owner = `github_owner`), `project` (the CV project slug), a short `note` (≤ 300 characters) saying what the repository is |

A **new kind** (a new `source_type` or `category`) is a contract change. Do these first, in this order:
1. SPEC §4.2 (`sources.source_type`) and §4.4 (`points.json`);
2. an Alembic migration for the `ck_chunks_source_type` check constraint;
3. `SourceType` in `schemas/chat.py`, then `pnpm --dir apps/web run gen:api`;
4. a colour token for the map points (Phase 6);
5. a loader in `ingestion/` that returns `make_document(...)` documents, added to `sources.py` (repository files) or to `cli.py` (network sources, fetched before `run`).

## 3. Tests (in `apps/api/tests/ingestion/`)
- Loader behaviour on a small fixture: metadata exact (`doc_id`, `source_type`, `category`, `title`, `url`, `source_date`, `project`), text, rejection of unknown frontmatter keys.
- Network sources: mocked with `httpx.MockTransport`; only allow-listed URLs requested; no token sent; a failed fetch raises (never silently drops the source, which would delete its chunks).
- The repository-wide tests must stay green: `test_sources.py` (unique `doc_id`, no phone number, personal facts only from the personal file) and `test_chunking.py`.
- New mentor-task tests carry `@pytest.mark.mentor_pending`; only Ivan removes it.

## 4. Reindex (paid: Ivan's consent)
1. `uv run --directory apps/api python -m site_api.ingestion --estimate` — free: the plan (unchanged / to write / to delete / to embed) and the embedding cost.
2. Show Ivan the estimate. Only with his OK: `… --apply`.
3. A re-run of `--estimate` must then report `0 to write, 0 to delete` and `0 to compute`.

## 5. 2D projection (from ROADMAP 6.1)
New chunks are placed with the fitted UMAP model (`transform`); chunks with a known content hash keep their point ([ADR-0006](../../../docs/adr/0006-2d-projection.md)). `--refit` only deliberately, with Ivan. Check `points.json` ≤ 50 KB gzip.

## 6. Eval cases (from ROADMAP 4.5)
Add at least:
- one **in-scope** question per new source that only this source answers (EN plus one of ES / RU / UK);
- one **unknown-fact** question close to the source's topic that it does *not* answer (expects the "no information" template);
- for personal or employer content, a **personal** or **NDA** case.

Then estimate the eval cost and run evals only with Ivan's consent (golden rule 13).

## 7. Report
List the source, the approval, the estimate, whether `--apply` ran, the eval result, and update ARCHITECTURE §5 if the kinds of sources changed.
