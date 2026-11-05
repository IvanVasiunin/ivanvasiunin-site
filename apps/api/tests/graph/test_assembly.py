"""The compiled chat graph (ROADMAP 4.3): its shape, and its diagram in ARCHITECTURE §4."""

from pathlib import Path

from site_api.graph.assembly import build_chat_graph, chat_graph_mermaid
from site_api.graph.nodes import ChatState, after_gate, after_router

ARCHITECTURE = Path(__file__).resolve().parents[4] / "docs" / "ARCHITECTURE.md"
START_MARKER = "<!-- generated: chat_graph_mermaid() -->"
END_MARKER = "<!-- end generated -->"


def test_the_graph_has_the_nodes_of_architecture_section_4() -> None:
    nodes = set(build_chat_graph().get_graph().nodes)

    assert nodes == {
        "__start__",
        "router",
        "template",
        "retrieval",
        "relevance_gate",
        "no_info",
        "generate",
        "finish",
        "__end__",
    }


def test_only_about_ivan_reaches_retrieval() -> None:
    assert after_router(ChatState(question="q", route="about_ivan")) == "retrieval"
    for route in ("greeting", "off_topic", "injection"):
        assert after_router(ChatState(question="q", route=route)) == "template"


def test_only_relevant_context_reaches_the_answer_model() -> None:
    assert after_gate(ChatState(question="q", relevant=True)) == "generate"
    assert after_gate(ChatState(question="q", relevant=False)) == "no_info"


def test_the_diagram_in_architecture_md_is_the_compiled_graph() -> None:
    # langchain-rag.md: after a graph change, the diagram is regenerated from the compiled graph.
    # To update: replace the block between the markers with `chat_graph_mermaid()`.
    text = ARCHITECTURE.read_text(encoding="utf-8")
    block = text.split(START_MARKER, 1)[1].split(END_MARKER, 1)[0]

    assert block.strip() == f"```mermaid\n{chat_graph_mermaid().strip()}\n```"
