# `graph/` — Elio's chat graph

The chat pipeline as a LangGraph `StateGraph` ([ADR-0008](../../../../../docs/adr/0008-langchain-langgraph-roles.md), [ARCHITECTURE §4](../../../../../docs/ARCHITECTURE.md)):

```
router ─┬─ about_ivan ─► retrieval ─► relevance_gate ─┬─ generate ─┐
        │                                             └─ no_info ──┤
        └─ greeting / off_topic / injection / rude ─► template ────┴─► finish
```

The input guard (rate, length, budget, streams, session) runs before the graph, in the HTTP layer (`routers/chat.py`, `services/limits.py`), because its refusals need an HTTP status.

| File | What it holds |
|---|---|
| `assembly.py` | Builds and compiles the graph; `run_chat` streams its SSE events; `chat_graph_mermaid()` for the docs |
| `nodes.py` | The typed state (`ChatState`), the run's context (`ChatContext`), every node and both branch functions |
| `router.py` | The router call: structured output, fail closed (`RouterError`) |
| `generate.py` | The answer model's stream: text deltas, then finish reason and token usage |
| `models.py` | Chat models from config (`init_chat_model`); OpenAI ↔ Anthropic is a config change |
| `usage.py` | Durations, token usage lines and cost estimates |
| `sources.py` | Retrieved chunks as `sources` items; the client history, capped |

- **State** is a dataclass; each node returns only the fields it sets. Usage lines and costs are appended by reducers.
- **Dependencies** (models, retriever, settings, the day's spend, the deadline) travel as the run's runtime context, never in the state.
- **Streaming:** nodes emit SSE events through LangGraph's stream writer (`stream_mode="custom"`). Closing the run (the visitor's Stop) cancels the running node and closes the provider's stream.
- **Docs:** `tests/graph/test_assembly.py` fails when the diagram in ARCHITECTURE §4 and the compiled graph disagree.

Mentor mode for this folder is paused since 2026-11-05 at Ivan's request: Claude writes the code and explains it ([ADR-0007](../../../../../docs/adr/0007-mentor-mode.md)).

Rules: [`.claude/rules/langchain-rag.md`](../../../../../.claude/rules/langchain-rag.md) → *Graph*. Roadmap: 3.7, 4.2, 4.3, 5.1.
