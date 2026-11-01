---
paths:
  - "apps/api/src/site_api/db/**"
  - "apps/api/migrations/**"
  - "apps/api/alembic.ini"
  - "infra/docker-compose*.yml"
---

# PostgreSQL / pgvector

Decision record: [ADR-0003](../../docs/adr/0003-vector-database.md). Verification tags: `[test]`, `[review]`.

## Schema
- The schema changes **only** through Alembic migrations. No `create_all()`, no library table-init helpers (`PGVectorStore` table creation), no manual DDL. `[review]` `[test]` (migration test: `upgrade head` on an empty DB produces the expected tables)
- Every migration has a working `downgrade`. `[test]` (up → down → up)
- `chunks.embedding` is `vector(1536)`, matching `text-embedding-3-large @ 1536`. A dimension change needs a migration and a full reindex. `[review]`
- **Indexes:** HNSW (cosine) on `embedding`; GIN on the generated `tsv` column. `[test]` (migration test asserts the indexes exist)

## Access
- Database access goes through psycopg 3 (async in the API). Queries are parameterized; no string-formatted SQL. `[lint]` (ruff `S608`) `[review]`
- The DB is reachable only on the internal Compose network. No `ports:` on the `db` service in production. `[review]` `[test]` (compose config check)
- Credentials come from env / pydantic-settings. `[review]`

## Operations
- Scheduled `pg_dump` backups and the restore drill are described in `docs/RUNBOOK.md`. `[review]`
- Chat statistics older than the retention period (config) are deleted by a scheduled job. `[test]`
