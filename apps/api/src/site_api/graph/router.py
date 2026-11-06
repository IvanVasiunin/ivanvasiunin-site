"""The router: classify a question before anything expensive runs (ROADMAP 4.2, ADR-0004 layer 2).

A cheap model (`gpt-6-luna` by default) reads the question and returns structured output: one of
the four classes of SPEC §5.1 and the question's language. Only `about_ivan` goes on to retrieval
and the answer model; the other classes get a localized template.

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
ROUTER_PROMPT_FILE = "router.v2.md"
# For an empty or unusable language code (ISO 639-1, sometimes 639-2).
DEFAULT_LANGUAGE = "en"
_LANGUAGE_CODE = re.compile(r"[a-z]{2,3}")


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
    """What the router model returns: the class and the language of the latest message.

    Kept to two plain fields: the providers' strict structured output modes accept only simple
    schemas (every field required, no extra keys), and fewer output tokens are cheaper and faster.
    """

    route: Route = Field(description="The class of the latest visitor message.")
    language: str = Field(
        description="ISO 639-1 code of the language the latest message is written in, e.g. en."
    )


@dataclass(frozen=True, slots=True)
class Routed:
    """The router's result: the decision (language normalized) and the tokens it cost."""

    route: Route
    language: str
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
    return Routed(route=parsed.route, language=normalize_language(parsed.language), usage=usage)


def normalize_language(code: str) -> str:
    """The primary language subtag in lowercase (`pt-BR` → `pt`), or `en` when unusable."""
    primary = code.strip().lower().replace("_", "-").split("-", 1)[0]
    return primary if _LANGUAGE_CODE.fullmatch(primary) else DEFAULT_LANGUAGE
