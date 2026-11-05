"""The messages the answer model receives (ROADMAP 3.7).

The order serves prompt caching: providers reuse a repeated prefix of the prompt, so what never
changes (the system prompt) goes first, then what changes with each question (the retrieved
context), then the conversation. Retrieved text and client history are data, not instructions
(langchain-rag.md): the context is fenced in tags, and the history stays plain user and assistant
turns.
"""

from collections.abc import Sequence
from functools import cache
from html import escape
from importlib.resources import files

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from site_api.core.config import ModelProvider
from site_api.rag.search import Candidate
from site_api.schemas.chat import ChatTurn

# The prompt in use. New wording goes into a new file (system.v2.md), so evals can compare them.
SYSTEM_PROMPT_FILE = "system.v2.md"


@cache
def load_system_prompt() -> str:
    """Read the versioned system prompt file shipped in this package (once, then cached)."""
    return (files("site_api.prompts") / SYSTEM_PROMPT_FILE).read_text(encoding="utf-8")


def format_context(chunks: Sequence[Candidate]) -> str:
    """Render the retrieved chunks as tagged sources, so the model can tell them apart."""
    sources = [
        f'<source id="{escape(chunk.chunk_id)}" type="{chunk.source_type}" '
        f'section="{escape(chunk.section)}">\n{_fenced(chunk.content)}\n</source>'
        for chunk in chunks
    ]
    return "\n\n".join(sources)


def _fenced(content: str) -> str:
    """The text with any `</source` defused, so a chunk can never close its own tag early.

    The corpus is our own, but READMEs and docs may quote such tags in code examples: a stray
    closing tag would make the rest of that chunk read as text outside any source.
    """
    return content.replace("</source", "&lt;/source")


def _system_message(context: str, provider: ModelProvider) -> SystemMessage:
    """The system prompt, then the context; for Anthropic, a cache breakpoint between them."""
    prompt = load_system_prompt()
    if not context:
        # No sources (the relevance gate normally stops before this): no empty block, which
        # Anthropic would reject.
        return SystemMessage(content=prompt)
    if provider == "anthropic":
        # Anthropic caches only up to an explicit breakpoint: `cache_control` on the static
        # block marks its end. The context after it changes with every question.
        return SystemMessage(
            content=[
                {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": context},
            ]
        )
    # OpenAI caches the longest repeated prefix by itself: plain text, with the prompt first.
    return SystemMessage(content=f"{prompt}\n\n{context}")


def build_answer_messages(
    question: str,
    history: Sequence[ChatTurn],
    chunks: Sequence[Candidate],
    *,
    provider: ModelProvider,
) -> list[BaseMessage]:
    """Order the prompt for caching: static prompt, context, history, question."""
    messages: list[BaseMessage] = [_system_message(format_context(chunks), provider)]
    for turn in history:
        # Only the two roles the API accepts (schemas/chat.py); the text is passed as it is.
        if turn.role == "user":
            messages.append(HumanMessage(turn.content))
        else:
            messages.append(AIMessage(turn.content))
    messages.append(HumanMessage(question))
    return messages
