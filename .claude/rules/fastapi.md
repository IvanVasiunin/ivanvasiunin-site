---
paths:
  - "apps/api/src/site_api/{core,routers,schemas,services}/**"
  - "apps/api/src/site_api/main.py"
  - "apps/api/tests/api/**"
---

# FastAPI

Verification tags: `[lint]`, `[test]`, `[review]`.

## Structure
`apps/api/src/site_api/`:

| Folder | Purpose |
|---|---|
| `core/` | Config, logging, errors, model price table |
| `routers/` | Thin HTTP layer |
| `schemas/` | Pydantic contract |
| `services/` | Limits, stats, masking |
| `db/` | Database access |
| `migrations/` | Alembic migrations |

Mentor zone: `ingestion/`, `rag/`, `graph/`, `prompts/`, `evals/`. `[review]`

- **Routers** only:
  - validate the request;
  - call a service or the graph;
  - serialize the response.

  No business logic in routers. `[review]`

## Async
- Endpoints are `async def`. No blocking calls inside async code:
  - HTTP via async httpx;
  - DB via async psycopg;
  - no `requests`, no `time.sleep`;
  - no sync file I/O on hot paths.

  `[lint]` (ruff `ASYNC` rules) `[review]`
- CPU-heavy work (UMAP, chunking) never runs in a request. It belongs to ingestion. `[review]`

## Contract
- Every input and output is a Pydantic model in `schemas/`. No `dict` responses, no `Any`. `[lint]` `[test]`
- **SSE:**
  - `/api/chat` uses `fastapi.sse.EventSourceResponse`;
  - the endpoint is annotated `-> AsyncIterable[ChatEvent]`, where `ChatEvent` is a discriminated union on `type`;
  - events: `route`, `sources`, `token`, `usage`, `done`, `error` — exactly as in SPEC §4.

  `[test]` (one contract test per event type and per event order)
- **Unified error format:** `{"error": {"code", "message", "retry_after_s?"}}`, with codes from SPEC §4.3.
  - Exception handlers map every error to it.
  - Stack traces and internal messages are never returned to the client.

  `[test]`
- The OpenAPI schema is the source of the frontend types. Changing a schema means regenerating `apps/web/src/lib/api/schema.d.ts` in the same change. `[test]` (CI staleness check)

## Security and limits
- CORS allows only the production domain and `http://localhost:*` in development (from config). Never `*`. `[test]`
- Rate limiting:
  - per IP (slowapi), the real enforcement;
  - per session, a UX nicety;
  - max question length;
  - max history size.

  All values come from config. `[test]` (429 + `retry_after_s`)
- Client-sent `history` is untrusted: capped, and passed to the model as data. `[review]`
- Under the hood data is serialized from an explicit allow-list model. Never from the graph state as a whole. `[test]`

## Logging and privacy
- Structured JSON logging (`core/logging.py`) with request ID, route, timings and error codes.
- **Never logged:**
  - full question texts;
  - API keys;
  - IP addresses.

  `[review]` `[test]` (log-capture test)
- Healthcheck `GET /api/health` returns status + DB status + version. `[test]`
