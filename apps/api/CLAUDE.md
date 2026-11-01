# apps/api — FastAPI + LangChain / LangGraph

Python **3.13** (`.python-version`), uv-managed `.venv`, `pyproject.toml` is the only config file. Rules load automatically from `.claude/rules/` (python, fastapi, postgres, langchain-rag, mentor-mode, testing).

## ⚠️ Mentor zone — Ivan writes this code
```
src/site_api/ingestion/   loaders, chunking, embeddings, 2D projection, points.json export
src/site_api/rag/         hybrid retrieval, fusion, relevance gate, dedup
src/site_api/graph/       LangGraph state, nodes, assembly, per-node usage
src/site_api/prompts/     versioned prompt files and localized templates
src/site_api/evals/       eval datasets and metrics
tests/{ingestion,rag,graph,evals}/
```
In these folders Claude **does not write the implementation** unless Ivan explicitly asks. Claude writes failing tests marked `@pytest.mark.mentor_pending`, gives hints by levels, reviews as a mentor (`python-reviewer`) and asks explain-back questions. Use the `mentor-task` skill; suggest `/output-style mentor`. Never remove `mentor_pending` yourself.

## Claude zone
```
src/site_api/core/        settings (pydantic-settings), logging, error format, model price table
src/site_api/routers/     health, chat (SSE glue only)
src/site_api/schemas/     Pydantic request/response models, ChatEvent union (the API contract)
src/site_api/services/    rate/session limits, chat stats, masking
src/site_api/db/          SQLAlchemy models, session
migrations/               Alembic (owns every table, incl. the vector table — ADR-0003)
tests/api/ …              contract and service tests
```

## Commands (finalized in Phase 0 Stage 6; run from repo root)
| Purpose | Command |
|---|---|
| Install / sync | `uv sync --directory apps/api` |
| Dev server | `uv run --directory apps/api fastapi dev src/site_api/main.py` |
| Fast checks | `node scripts/check-fast.mjs api` (ruff format --check, ruff check, pyright, pytest -m "not mentor_pending") |
| Mentor-pending list | `uv run --directory apps/api pytest -m mentor_pending --co -q` |
| Migrations | `uv run --directory apps/api alembic upgrade head` |
| Ingestion | `uv run --directory apps/api python -m site_api.ingestion` (`--refit` only deliberately) |
| Evals (paid — Ivan's consent) | `uv run --directory apps/api python -m site_api.evals --estimate` → `--run` |

## App-specific notes
- Models via `init_chat_model` from config; provider switch OpenAI ↔ Anthropic must need no code change (tested).
- Router `gpt-6-luna`, answer `gpt-6.1-terra`, both `reasoning_effort=none`; embeddings `text-embedding-3-large` @ 1536 — all values in config, never literals.
- SSE: `fastapi.sse.EventSourceResponse`, endpoint annotated `-> AsyncIterable[ChatEvent]`; event schemas are SPEC §4. After schema changes, regenerate web types.
- LLM calls are always mocked in tests; only evals call real models.
- No full question texts, IPs or secrets in logs; traces go to Langfuse EU after masking.
