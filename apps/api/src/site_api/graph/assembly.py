"""Assemble Elio's chat graph and run it for one question (ROADMAP 4.3, ARCHITECTURE §4).

The nodes and their typed state live in `graph/nodes.py`; this module only wires them together
and turns a run into a stream of SSE events.
"""

# LangGraph's builder API is typed with internal unknowns (`CachePolicy[Unknown]`, untyped
# submodules), which pyright strict reports on every call. This small module is the only place
# that calls it, so the two reports are relaxed here, not in the nodes, which stay strict.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false

from collections.abc import AsyncGenerator, Sequence

from langchain_core.callbacks import BaseCallbackHandler
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from site_api.graph.nodes import (
    ChatContext,
    ChatState,
    after_gate,
    after_router,
    finish,
    generate,
    no_info,
    relevance_gate,
    retrieval,
    router,
    template,
)
from site_api.schemas.chat import (
    ChatEvent,
    ChatTurn,
    DoneEvent,
    RouteEvent,
    SourcesEvent,
    TokenEvent,
    UsageEvent,
)

type ChatGraph = CompiledStateGraph[ChatState, ChatContext, ChatState, ChatState]

# The events nodes emit; anything else on the stream is a bug, not something to skip.
_EVENT_TYPES = (RouteEvent, SourcesEvent, TokenEvent, UsageEvent, DoneEvent)


def build_chat_graph() -> ChatGraph:
    """Assemble and compile the graph once; every request runs the same compiled graph."""
    builder = StateGraph(ChatState, context_schema=ChatContext)
    builder.add_node("router", router)
    builder.add_node("template", template)
    builder.add_node("retrieval", retrieval)
    builder.add_node("relevance_gate", relevance_gate)
    builder.add_node("no_info", no_info)
    builder.add_node("generate", generate)
    builder.add_node("finish", finish)
    builder.add_edge(START, "router")
    builder.add_conditional_edges("router", after_router)
    builder.add_edge("template", "finish")
    builder.add_edge("retrieval", "relevance_gate")
    builder.add_conditional_edges("relevance_gate", after_gate)
    builder.add_edge("no_info", "finish")
    builder.add_edge("generate", "finish")
    builder.add_edge("finish", END)
    return builder.compile()


def chat_graph_mermaid() -> str:
    """The compiled graph as Mermaid, for docs/ARCHITECTURE.md §4 (a test keeps them in sync)."""
    return build_chat_graph().get_graph().draw_mermaid()


async def run_chat(
    graph: ChatGraph,
    question: str,
    history: Sequence[ChatTurn],
    context: ChatContext,
    callbacks: Sequence[BaseCallbackHandler] = (),
) -> AsyncGenerator[ChatEvent]:
    """Run the graph for one question and yield its SSE events as the nodes emit them.

    `callbacks` see the whole run (every node and model call): tracing hooks in here.
    """
    initial = ChatState(question=question, history=list(history))
    stream = graph.astream(
        initial,
        config={"callbacks": list(callbacks), "run_name": "elio-chat"},
        context=context,
        stream_mode="custom",
    )
    # `astream` is typed as a plain iterator, but it is an async generator, which can close.
    if not isinstance(stream, AsyncGenerator):
        msg = "LangGraph's astream is expected to be an async generator"
        raise TypeError(msg)
    try:
        async for event in stream:
            if not isinstance(event, _EVENT_TYPES):
                msg = f"a node emitted {type(event).__name__}, not a chat event"
                raise TypeError(msg)
            yield event
    finally:
        # Stop closes this generator (services/chat.py closes it with `aclosing`); closing the
        # graph's stream in turn cancels the running node, and with it the provider's stream
        # (graph/generate.py), at once rather than at garbage collection.
        await stream.aclose()
