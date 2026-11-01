# `ingestion/` — mentor zone

**Ivan writes this code** ([ADR-0007](../../../../../docs/adr/0007-mentor-mode.md)); Claude writes failing tests marked `mentor_pending` and reviews.

Turns the knowledge sources into searchable chunks:

1. **Load** the CV content collection, `data/*.md` (never `data/raw/`), the site docs (SPEC, ARCHITECTURE, ADRs) and allow-listed GitHub READMEs.
2. **Chunk** them heading-aware, with metadata (`source_type`, `category`, `section`, `project`, `url`, `source_date`, `chunk_id`).
3. **Embed** with `text-embedding-3-large` @ 1536 dims, idempotently by content hash.
4. **Project** the vectors to 2D (UMAP, fixed `random_state`, [ADR-0006](../../../../../docs/adr/0006-2d-projection.md)) and export `points.json`.

Rules: [`.claude/rules/langchain-rag.md`](../../../../../.claude/rules/langchain-rag.md) → *Ingestion*. Roadmap: 3.2–3.5, 6.1.
