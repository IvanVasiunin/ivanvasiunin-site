"""The answer model comes from config only: OpenAI ↔ Anthropic is a settings change (ROADMAP 3.7).

The models are built but never called: building one makes no network request.
"""

import pytest
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from site_api.graph.models import ModelConfigError, build_answer_model, build_router_model

from .conftest import make_settings

OPENAI_KEY = SecretStr("test-openai-key")
ANTHROPIC_KEY = SecretStr("test-anthropic-key")


def test_openai_is_the_default_answer_model() -> None:
    model = build_answer_model(make_settings(openai_api_key=OPENAI_KEY))

    assert isinstance(model, ChatOpenAI)
    assert model.model_name == "gpt-6.1-terra"
    # ADR-0001: no reasoning, for a short time to the first token.
    assert model.reasoning_effort == "none"
    assert model.max_tokens == 800
    # Without it, OpenAI's streamed answers carry no token counts (the `usage` event needs them).
    assert model.stream_usage is True


def test_switching_to_anthropic_is_only_a_config_change() -> None:
    model = build_answer_model(
        make_settings(
            answer_provider="anthropic",
            answer_model="claude-haiku-5-5",
            answer_max_output_tokens=500,
            anthropic_api_key=ANTHROPIC_KEY,
        )
    )

    assert isinstance(model, ChatAnthropic)
    assert model.model == "claude-haiku-5-5"
    assert model.max_tokens == 500


def test_each_provider_gets_its_own_key_from_settings() -> None:
    openai = build_answer_model(
        make_settings(openai_api_key=OPENAI_KEY, anthropic_api_key=ANTHROPIC_KEY)
    )
    anthropic = build_answer_model(
        make_settings(
            answer_provider="anthropic",
            openai_api_key=OPENAI_KEY,
            anthropic_api_key=ANTHROPIC_KEY,
        )
    )

    assert isinstance(openai, ChatOpenAI)
    assert isinstance(anthropic, ChatAnthropic)
    # Typed loosely by the libraries (a default factory reads the environment): narrow first.
    openai_key: object = openai.openai_api_key
    anthropic_key: object = anthropic.anthropic_api_key
    assert isinstance(openai_key, SecretStr)
    assert isinstance(anthropic_key, SecretStr)
    assert openai_key.get_secret_value() == "test-openai-key"
    assert anthropic_key.get_secret_value() == "test-anthropic-key"


def test_timeout_and_retries_come_from_settings() -> None:
    values = {"answer_timeout_s": 12.0, "answer_max_retries": 0}
    openai = build_answer_model(make_settings(openai_api_key=OPENAI_KEY, **values))
    anthropic = build_answer_model(
        make_settings(answer_provider="anthropic", anthropic_api_key=ANTHROPIC_KEY, **values)
    )

    assert isinstance(openai, ChatOpenAI)
    assert isinstance(anthropic, ChatAnthropic)
    assert (openai.request_timeout, openai.max_retries) == (12.0, 0)
    assert (anthropic.default_request_timeout, anthropic.max_retries) == (12.0, 0)


@pytest.mark.parametrize(
    ("provider", "variable"),
    [("openai", "OPENAI_API_KEY"), ("anthropic", "ANTHROPIC_API_KEY")],
)
def test_a_missing_key_names_the_variable_to_set(provider: str, variable: str) -> None:
    settings = make_settings(answer_provider=provider, openai_api_key=None, anthropic_api_key=None)

    with pytest.raises(ModelConfigError, match=variable):
        build_answer_model(settings)


def test_the_router_is_the_cheap_model_with_a_small_output_cap() -> None:
    # ADR-0001: gpt-6-luna, no reasoning; a decision is a few tokens of JSON and a one-line
    # search query (SPEC §5.1, 2026-11-08).
    model = build_router_model(make_settings(openai_api_key=OPENAI_KEY))

    assert isinstance(model, ChatOpenAI)
    assert model.model_name == "gpt-6-luna"
    assert model.reasoning_effort == "none"
    assert model.max_tokens == 150


def test_the_router_switches_provider_by_config_alone() -> None:
    model = build_router_model(
        make_settings(
            router_provider="anthropic",
            router_model="claude-haiku-5-5",
            anthropic_api_key=ANTHROPIC_KEY,
        )
    )

    assert isinstance(model, ChatAnthropic)
    assert model.model == "claude-haiku-5-5"


def test_the_router_needs_its_providers_key() -> None:
    with pytest.raises(ModelConfigError, match="ANTHROPIC_API_KEY"):
        build_router_model(make_settings(router_provider="anthropic", openai_api_key=OPENAI_KEY))
