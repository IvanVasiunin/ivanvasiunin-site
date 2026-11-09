# ADR-0003: Vector database and schema ownership

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

The knowledge base is small: a few hundred chunks. It needs:
- vector similarity search;
- full-text search, for hybrid retrieval;
- metadata filters (`source_type`, `category`, `project`);
- stored 2D coordinates.

The site also needs a small relational store for anonymous chat statistics.

Rule 4.10: the schema changes only through migrations. The DB is reachable only inside the Compose network.

## Options

| Option | Pros | Cons |
|---|---|---|
| **PostgreSQL 18 + pgvector 0.8.7** | One service for vectors, FTS, metadata and stats; HNSW for vectors and GIN for tsvector; SQL that the owner can inspect; LangChain integration (`langchain-postgres` `PGVectorStore` with `HybridSearchConfig`) | `langchain-postgres` is pre-1.0 (0.0.19) and its old `PGVector` class is already deprecated |
| Qdrant | Purpose-built, good filtering, hybrid with sparse vectors | A second database for stats; sparse / BM25 setup is a separate concept to learn; more containers on a small VPS |
| SQLite + sqlite-vec | Zero services | Weak FTS fusion story; not a "real" vector DB for the portfolio; concurrency with an async API |

## Decision

- **PostgreSQL 18 with pgvector** (image `pgvector/pgvector:0.8.7-pg18-trixie`), accessed via **psycopg 3**.
- **Alembic owns every table**, including the vector table. The `chunks` table is created by a migration with:
  - `id` (text, stable chunk id), `content` (text), `embedding` (`vector(1536)`);
  - `source_type`, `category`, `section`, `project`, `url`, `source_date`;
  - `content_hash`;
  - `x`, `y` (real, 0..1);
  - `tsv` (`tsvector`, generated column);
  - `created_at`, `updated_at`.
- **Indexes:** HNSW on `embedding` (cosine) and GIN on `tsv`. At this size they matter little, but they are part of the demonstrated design.
- **`PGVectorStore`** is attached to this existing table (custom table and column names). Its table-initialization helpers are never called, so the table shape is not driven by the library.
- **Hybrid search:** vector similarity + Postgres FTS, combined with Reciprocal Rank Fusion (RRF) via `HybridSearchConfig`.

## Consequences

- The schema is fully visible in migrations, which is reviewable and explainable in interviews.
- **Fallback if attaching `PGVectorStore` to a custom table proves awkward:** hand-written retrieval SQL (vector query + FTS query + RRF in Python), which is also a valuable mentor-mode exercise. The exact `PGVectorStore` custom-table API is UNVERIFIED and is checked via Context7 in Phase 3.
- `vector(1536)` is tied to the embedding choice in [ADR-0001](0001-tech-stack.md). Changing the model means a migration plus a full reindex.
- **Backups:** scheduled `pg_dump`, described in the [RUNBOOK](../RUNBOOK.md).
- **Roles (follow-up, Phase 8):** today the API and the migrations share the database owner `site` (a superuser in the pgvector image). Before launch, the API gets its own role with only `SELECT` / `INSERT` / `UPDATE` / `DELETE` on its tables; the owner stays for migrations (`CREATE EXTENSION` needs it). In development, Postgres MCP already uses a read-only `mcp_reader` role (ROADMAP 3.1).

## Amendment (2026-11-04, ROADMAP 3.6) — status: Proposed

**The recorded fallback is taken: hand-written retrieval SQL instead of `PGVectorStore`.**

- **Why:** every langchain-postgres release up to 0.0.19 (October 2026) declares `pgvector>=0.2.5,<0.4` and `psycopg[binary]`. The project pins pgvector-python 0.5.1 (migration 0001) and runs pure `psycopg` on the image's system libpq, so the package cannot be installed without downgrading pgvector and adding the binary wheel. That is the "integration fights the schema / stack" case of [ADR-0008](0008-langchain-langgraph-roles.md).
- **What instead (`rag/search.py`, `rag/fusion.py`, `rag/retrieval.py`):**
  - vector search: `ORDER BY embedding <=> :query LIMIT n` (cosine distance, uses the HNSW index);
  - full-text search: `tsv @@ to_tsquery(replace(plainto_tsquery('english', :q)::text, '&', '|'))` ranked by `ts_rank` (uses the GIN index). OR instead of the default AND, because a natural question rarely has all its words in one chunk; `plainto_tsquery` keeps any user input free of tsquery syntax errors;
  - Reciprocal Rank Fusion in Python (k = 60, config), normalized to 0..1 for the `sources` event;
  - at most `retrieval_max_per_project` chunks per project, then the top `retrieval_top_k` (config).
- **Kept from the decision:** LangChain `Embeddings` for the query embedding (same model and size as ingestion), the Alembic-owned table, both indexes.
- **Revisit** when a langchain-postgres release supports pgvector-python ≥ 0.4; the `ChunkSearch` protocol keeps the swap local to `rag/search.py`.
