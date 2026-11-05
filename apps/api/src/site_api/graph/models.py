"""The chat models Elio talks to, built from config (ROADMAP 3.7, 4.2, ADR-0001, ADR-0008).

A factory, not a model created at import time: the provider, the model and its limits are
settings, so switching OpenAI ↔ Anthropic is a change in the environment, never in code, and a
test can build either model without any network call. Two models use it: the answer model, which
streams Elio's answers, and the router, a cheap model that classifies each question first.
"""

from dataclasses import dataclass
from typing import Literal

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr

from site_api.core.config import ModelProvider, Settings


class ModelConfigError(RuntimeError):
    """The settings choose a provider whose API key is not set."""


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """Everything that picks and limits one chat model, read from settings."""

    provider: ModelProvider
    model: str
    max_output_tokens: int
    timeout_s: float
    max_retries: int
    # OpenAI only: how long the model "thinks" before answering; `none` keeps the latency low.
    reasoning_effort: Literal["none", "low", "medium", "high"]


def _require_key(key: SecretStr | None, variable: str) -> SecretStr:
    """Return the key, or fail with the name of the environment variable to set."""
    if key is None:
        msg = f"{variable} is not set, and a chat model needs it"
        raise ModelConfigError(msg)
    return key


def build_chat_model(spec: ModelSpec, settings: Settings) -> BaseChatModel:
    """Build one chat model; the provider's key comes from settings.

    `init_chat_model` picks the provider's class by `model_provider` (ChatOpenAI or
    ChatAnthropic) and passes every other keyword argument to it, so one function covers both.
    """
    if spec.provider == "anthropic":
        return init_chat_model(
            spec.model,
            model_provider="anthropic",
            api_key=_require_key(settings.anthropic_api_key, "ANTHROPIC_API_KEY"),
            max_tokens=spec.max_output_tokens,
            timeout=spec.timeout_s,
            max_retries=spec.max_retries,
        )
    return init_chat_model(
        spec.model,
        model_provider="openai",
        api_key=_require_key(settings.openai_api_key, "OPENAI_API_KEY"),
        max_tokens=spec.max_output_tokens,
        timeout=spec.timeout_s,
        max_retries=spec.max_retries,
        # OpenAI only: `none` skips the hidden reasoning step, so the first token comes sooner.
        reasoning_effort=spec.reasoning_effort,
        # OpenAI streams no token counts unless asked; the `usage` event needs them.
        stream_usage=True,
    )


def build_answer_model(settings: Settings) -> BaseChatModel:
    """The model that writes Elio's answers (settings `answer_*`)."""
    spec = ModelSpec(
        provider=settings.answer_provider,
        model=settings.answer_model,
        max_output_tokens=settings.answer_max_output_tokens,
        timeout_s=settings.answer_timeout_s,
        max_retries=settings.answer_max_retries,
        reasoning_effort=settings.answer_reasoning_effort,
    )
    return build_chat_model(spec, settings)


def build_router_model(settings: Settings) -> BaseChatModel:
    """The cheap model that classifies each question (settings `router_*`)."""
    spec = ModelSpec(
        provider=settings.router_provider,
        model=settings.router_model,
        max_output_tokens=settings.router_max_output_tokens,
        timeout_s=settings.router_timeout_s,
        max_retries=settings.router_max_retries,
        reasoning_effort=settings.router_reasoning_effort,
    )
    return build_chat_model(spec, settings)
