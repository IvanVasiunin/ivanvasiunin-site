"""What the graph shows of its inputs: retrieved chunks as `sources`, history capped (SPEC §4.2).

Small, pure helpers the nodes share; no model, no I/O.
"""

from collections.abc import Sequence

from site_api.rag.retrieval import RetrievedChunk
from site_api.schemas.chat import SNIPPET_MAX_CHARS, ChatTurn, SourceItem, SourceType

# Source titles name the kind of source, then the section: "CV — BrainRocket". The chunks table
# has no title column; these labels match the chat UI's own (ChatTurn.tsx).
SOURCE_LABELS: dict[SourceType, str] = {
    "cv": "CV",
    "experience": "Experience notes",
    "personal": "Personal facts",
    "site_docs": "Site docs",
    "github_readme": "GitHub README",
}


def source_item(retrieved: RetrievedChunk) -> SourceItem:
    """A retrieved chunk as the `sources` event shows it: a title and a short snippet."""
    chunk = retrieved.chunk
    return SourceItem(
        chunk_id=chunk.chunk_id,
        # Fused scores are 0..1 already; the clamp keeps a float rounding error off the contract.
        score=min(max(retrieved.score, 0.0), 1.0),
        source_type=chunk.source_type,
        title=f"{SOURCE_LABELS[chunk.source_type]} — {chunk.section}",
        section=chunk.section,
        url=chunk.url,
        snippet=snippet(chunk.content),
    )


def snippet(content: str) -> str:
    """The chunk text on one line, cut to the contract's 200 characters with an ellipsis."""
    text = " ".join(content.split())
    if len(text) <= SNIPPET_MAX_CHARS:
        return text
    return text[: SNIPPET_MAX_CHARS - 1].rstrip() + "…"


def recent_history(history: Sequence[ChatTurn], max_turns: int, max_chars: int) -> list[ChatTurn]:
    """The last `max_turns` turns, each cut to `max_chars`.

    The client's history is untrusted (fastapi.md): without both caps, a few long made-up turns
    would multiply the input tokens, and the cost, of every answer.
    """
    # Not `history[-max_turns:]` alone: with 0, `history[-0:]` is the whole list.
    if max_turns == 0:
        return []
    return [_cut(turn, max_chars) for turn in history[-max_turns:]]


def _cut(turn: ChatTurn, max_chars: int) -> ChatTurn:
    """The turn, its text cut to `max_chars` with an ellipsis if longer."""
    if len(turn.content) <= max_chars:
        return turn
    return ChatTurn(role=turn.role, content=turn.content[: max_chars - 1] + "…")
