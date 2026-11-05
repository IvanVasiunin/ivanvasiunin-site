"""Shared fakes for the graph tests: settings without `.env`, and a scripted streaming model.

No test here calls a real model (langchain-rag.md: LLM calls in unit tests are always mocked).
"""

from collections.abc import AsyncIterator, Sequence

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from pydantic import Field, SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.core.config import Settings

# Placeholder only: settings demand a database URL, and no test here connects to it.
DATABASE_URL = "postgresql+psycopg://site@127.0.0.1:9/unused"


class GraphSettings(Settings):
    """Settings that never read the developer's real `.env`: only the values a test passes."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")


def make_settings(**values: object) -> Settings:
    """Settings for one test; every value not passed keeps its default from config."""
    return GraphSettings.model_validate({"database_url": SecretStr(DATABASE_URL), **values})


class ScriptedChatModel(BaseChatModel):
    """A chat model that streams exactly the chunks it is given, metadata included.

    LangChain's own `GenericFakeChatModel` streams only the text: it drops `usage_metadata` and
    `response_metadata`, which are what `stream_answer` reads at the end of an answer.
    """

    chunks: list[AIMessageChunk]
    # What the model was asked, for tests that check the messages it received.
    received: list[list[BaseMessage]] = Field(default_factory=list[list[BaseMessage]])
    # Whether the stream was closed, also when the reader stopped before its end.
    closed: bool = False

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> ChatResult:
        raise NotImplementedError

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> AsyncIterator[ChatGenerationChunk]:
        self.received.append(list(messages))
        try:
            for chunk in self.chunks:
                yield ChatGenerationChunk(message=chunk)
        finally:
            self.closed = True


def scripted(*chunks: AIMessageChunk) -> ScriptedChatModel:
    """A scripted model streaming `chunks`."""
    return ScriptedChatModel(chunks=list(chunks))


def texts(chunks: Sequence[str]) -> list[AIMessageChunk]:
    """Plain text chunks, as a model streams an answer."""
    return [AIMessageChunk(content=text) for text in chunks]
