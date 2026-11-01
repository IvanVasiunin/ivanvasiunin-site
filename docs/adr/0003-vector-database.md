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
