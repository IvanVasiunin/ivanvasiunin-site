"""The router: classify a question before anything expensive runs (ROADMAP 4.2, ADR-0004 layer 2).

A cheap model (`gpt-6-luna` by default) reads the question and returns structured output: one of
the classes of SPEC §5.1, the question's language and, for `about_ivan`, English search queries.
Only `about_ivan` goes on to retrieval and the answer model; the other classes get a localized
template.

Why the router writes the search query (SPEC §5.1, 2026-11-08): the knowledge base is English, so a
question in Ukrainian found almost nothing by full-text search and too little by vector search; a
follow-up ("and his skills?") means nothing on its own; and a broad question ("Where has he
worked?") is far from every single chunk. The router already reads the question and the history, so
rewriting them costs a few output tokens, not another model call.

Why several queries: one query for a whole job description lands on chunks that resemble the
vacancy "on average" (the summary, the profile) and misses single requirements such as education
or testing tools. One query per requirement finds each of them (`rag/retrieval.py` merges them).

**Fail closed** (ADR-0004): when the router call fails or its output does not parse, the request
ends with an error, never with a free-form answer. The caller maps `RouterError` and provider
errors to the `error` event.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from functools import cache
from html import escape
from importlib.resources import files

import openai
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from site_api.graph.generate import TokenUsage, token_usage
from site_api.schemas.chat import ChatTurn, Route

# The prompt in use. New wording goes into a new file (router.v2.md), so evals can compare them.
ROUTER_PROMPT_FILE = "router.v6.md"
# For an empty or unusable language code (ISO 639-1, sometimes 639-2).
DEFAULT_LANGUAGE = "en"
_LANGUAGE_CODE = re.compile(r"[a-z]{2,3}")
# The longest search query kept; a question may be 500 characters (MAX_QUESTION_CHARS).
MAX_SEARCH_QUERY_CHARS = 300
# The most search queries kept: one per requirement of a job description, or per part of a question.
MAX_SEARCH_QUERIES = 8


class RouterError(RuntimeError):
    """The router gave no usable decision: the request fails closed.

    `usage` holds the tokens the failed call was still billed for, when the provider reported them.
    """

    def __init__(self, message: str, usage: TokenUsage | None = None) -> None:
        super().__init__(message)
        self.usage: TokenUsage | None = usage


# OpenAI's own "the output was cut or filtered" errors: raised by the SDK's parse call itself,
# before LangChain's parser sees anything. A router answer cut at its token cap or blocked by the
# content filter is a refusal, not our bug.
_UNUSABLE_OUTPUT: tuple[type[Exception], ...] = (
    openai.LengthFinishReasonError,
    openai.ContentFilterFinishReasonError,
)


class RouterDecision(BaseModel):
    """What the router model returns: the class, the language and the search query.

    Kept to plain required fields: the providers' strict structured output modes accept only simple
    schemas (every field required, no extra keys), and fewer output tokens are cheaper and faster.
    """

    route: Route = Field(description="The class of the latest visitor message.")
    language: str = Field(
        description="ISO 639-1 code of the language the latest message is written in, e.g. en."
    )
    search_queries: list[str] = Field(
        description=(
            "For about_ivan: 1 to 8 short standalone search queries in English, one per part or "
            "requirement of the latest message. For every other class: an empty list."
        )
    )


@dataclass(frozen=True, slots=True)
class Routed:
    """The router's result: the decision (language normalized) and the tokens it cost.

    `search_queries` is empty when the router gave none; retrieval then searches with the question.
    """

    route: Route
    language: str
    search_queries: tuple[str, ...]
    usage: TokenUsage


@cache
def load_router_prompt() -> str:
    """Read the versioned router prompt shipped in this package (once, then cached)."""
    return (files("site_api.prompts") / ROUTER_PROMPT_FILE).read_text(encoding="utf-8")


def build_router_messages(question: str, history: Sequence[ChatTurn]) -> list[BaseMessage]:
    """The router's input: its prompt, then one message with the history and the question.

    The history comes from the visitor's browser and may be forged, "assistant" turns included.
    Passing it as real assistant messages would let a forged turn speak with the assistant's
    voice; inside one tagged visitor message it stays plain data (the prompt says so).
    """
    turns = "\n".join(
        f'<turn role="{turn.role}">{_as_data(turn.content)}</turn>' for turn in history
    )
    data = (
        f"<history>\n{turns}\n</history>\n<latest_message>\n{_as_data(question)}\n</latest_message>"
    )
    return [SystemMessage(load_router_prompt()), HumanMessage(data)]


def _as_data(text: str) -> str:
    """The text with `<`, `>` and `&` escaped, so it can never close or open a tag of its own."""
    return escape(text, quote=False)


async def route_question(model: BaseChatModel, messages: Sequence[BaseMessage]) -> Routed:
    """Classify the question; `RouterError` when the model's output does not parse."""
    # `with_structured_output` makes the provider return data that fits `RouterDecision` (OpenAI:
    # a strict JSON schema; Anthropic: a forced tool call) and parses it. `include_raw=True` also
    # returns the raw message, which carries the token counts for the `usage` event.
    structured = model.with_structured_output(RouterDecision, include_raw=True)
    try:
        result = await structured.ainvoke(list(messages))
    except _UNUSABLE_OUTPUT as error:
        msg = "the router's output was cut off or filtered"
        raise RouterError(msg) from error
    if not isinstance(result, dict):
        msg = "the router returned no structured result"
        raise RouterError(msg)
    parsed: object = result.get("parsed")
    raw: object = result.get("raw")
    usage = token_usage(raw if isinstance(raw, AIMessage) else None)
    if not isinstance(parsed, RouterDecision):
        # A refusal or malformed output: fail closed, never guess a class. The tokens were billed.
        msg = "the router's output did not parse"
        raise RouterError(msg, usage)
    return Routed(
        route=parsed.route,
        language=normalize_language(parsed.language),
        search_queries=clean_search_queries(parsed.search_queries),
        usage=usage,
    )


def clean_search_queries(queries: Sequence[str]) -> tuple[str, ...]:
    """Each query cleaned; blanks and repeats dropped; at most `MAX_SEARCH_QUERIES` of them.

    Model output from an untrusted question: every query costs one embedding and two searches, so
    their number is capped as well as their length.
    """
    kept: list[str] = []
    for query in queries:
        cleaned = clean_search_query(query)
        if cleaned and cleaned not in kept:
            kept.append(cleaned)
    return tuple(kept[:MAX_SEARCH_QUERIES])


def clean_search_query(query: str) -> str:
    """The query on one line, without extra spaces, at most `MAX_SEARCH_QUERY_CHARS` long.

    Model output from an untrusted question: it only ever goes to the embedding model and to a
    parameterized full-text query, but a runaway one must not cost more than a question would.
    """
    return " ".join(query.split())[:MAX_SEARCH_QUERY_CHARS]


def normalize_language(code: str) -> str:
    """The primary language subtag in lowercase (`pt-BR` → `pt`), or `en` when unusable."""
    primary = code.strip().lower().replace("_", "-").split("-", 1)[0]
    return primary if _LANGUAGE_CODE.fullmatch(primary) else DEFAULT_LANGUAGE
