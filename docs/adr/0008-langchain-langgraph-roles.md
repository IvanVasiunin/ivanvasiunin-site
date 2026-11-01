# ADR-0008: Roles of LangChain and LangGraph

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

The project demonstrates the LangChain ecosystem, but "use it everywhere" is not a reason. Each component needs a stated job, and a simpler alternative must be considered.

## Decision

| Component | Package | Job in this project | Why not plain code |
|---|---|---|---|
| Chat model abstraction | `langchain` (`init_chat_model`), `langchain-openai`, later `langchain-anthropic` | Provider and model chosen from config; streaming; structured output for the router | Switching OpenAI ↔ Anthropic without code changes is a requirement and is covered by a test |
| Embeddings | `langchain-openai` (`OpenAIEmbeddings`, `dimensions=1536`) | Embedding chunks at ingestion and queries at runtime | One interface shared with the vector store |
| Document loading and splitting | `langchain-text-splitters` (Markdown-header-aware splitting) + small custom loaders | Heading-aware chunks with metadata | Splitting Markdown by headers with overlap is tedious to get right by hand |
| Vector store | `langchain-postgres` (`PGVectorStore`, `HybridSearchConfig`) | Hybrid vector + FTS search with RRF over the Alembic-owned table ([ADR-0003](0003-vector-database.md)) | Fallback to hand-written SQL is allowed if the integration fights the schema |
| Orchestration | `langgraph` (`StateGraph`) | The graph `input_guard → router → retrieval → relevance_gate → generate / templates`, typed state, per-node timing, streaming events | Branching, typed state and per-node instrumentation are exactly what a graph gives; the compiled graph also exports to Mermaid for documentation |
| Tracing | Langfuse (LangChain callback handler) | Traces of every graph run, with masked inputs | Debugging RAG without traces is guesswork |
| Evals | DeepEval + pytest | Faithfulness, answer relevancy, router accuracy, policy cases | Not part of LangChain, by choice ([ADR-0001](0001-tech-stack.md)) |

**Not used:**
- LangChain agents or tools: the assistant does not need tool calling;
- LangChain memory classes: history is passed explicitly by the client;
- LCEL chains beyond trivial use: the graph is the orchestration layer;
- LangServe: FastAPI exposes the API directly.

## Consequences

- **The answer to "why LangGraph here?" is in this table.**
- **Version risk:** LangChain 1.x has frequent minor releases. Versions are pinned in `uv.lock`, and upgrades go through evals.
- **Mentor zone:** every component above sits in the mentor zone except the FastAPI wiring ([ADR-0007](0007-mentor-mode.md)).
