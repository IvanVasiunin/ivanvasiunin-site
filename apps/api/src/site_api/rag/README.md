# `rag/` — mentor zone

**Ivan writes this code** ([ADR-0007](../../../../../docs/adr/0007-mentor-mode.md)); Claude writes failing tests marked `mentor_pending` and reviews.

Finds the chunks that answer a question:

- **Hybrid search:** pgvector similarity + Postgres full-text search, fused with RRF ([ADR-0003](../../../../../docs/adr/0003-vector-database.md)).
- **Relevance gate:** below the threshold from config, the answer is the "no information" template.
- **Deduplication** per project, so one project does not fill the context with near-identical chunks.

Rules: [`.claude/rules/langchain-rag.md`](../../../../../.claude/rules/langchain-rag.md) → *Retrieval*. Roadmap: 3.6, 4.3.
