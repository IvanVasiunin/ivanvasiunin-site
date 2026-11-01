# `graph/` — mentor zone

**Ivan writes this code** ([ADR-0007](../../../../../docs/adr/0007-mentor-mode.md)); Claude writes failing tests marked `mentor_pending` and reviews.

The chat pipeline as a LangGraph graph ([ADR-0008](../../../../../docs/adr/0008-langchain-langgraph-roles.md)):

```
input_guard → router → retrieval → relevance_gate → generate | templates
```

- **State** is typed; each node is a small function that reads and writes only its own keys.
- Every node records its duration and token usage for the `usage` SSE event.
- Models come from config via `init_chat_model`, so OpenAI ↔ Anthropic is a config change.

Rules: [`.claude/rules/langchain-rag.md`](../../../../../.claude/rules/langchain-rag.md) → *Graph*. Roadmap: 3.7, 4.1–4.3, 5.1.
