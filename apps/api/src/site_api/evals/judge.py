"""The judge: DeepEval's faithfulness and answer relevancy on in-scope answers (ROADMAP 4.5).

- **Faithfulness:** does every claim in the answer follow from the retrieved sources? (SPEC §5.2:
  answer only from the context.)
- **Answer relevancy:** does the answer address the question?

DeepEval runs the judging prompts; the judge model is ours, built from config like every other
model (`EVAL_JUDGE_*`), so the provider switch and the price table apply to it too, and its tokens
are counted for the run's cost. DeepEval is a dev dependency: this module is imported only by the
eval runner, never by the API.
"""

# DeepEval's types are loose (untyped parameters, `Any` returns), so pyright strict reports most
# calls into it. This module is the only one that calls it, so those reports are relaxed here only.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportMissingTypeArgument=false, reportUntypedBaseClass=false

import os
from collections.abc import Sequence
from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel

from site_api.core.config import ModelPrice
from site_api.graph.generate import token_usage
from site_api.graph.usage import estimate_cost_usd

# DeepEval sends anonymous usage telemetry unless this is set, and reads it only from the
# environment, before it is imported (https://deepeval.com/docs/data-privacy).
os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "1")  # noqa: TID251 -- a third-party opt-out, not our config

from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase


class LangChainJudge(DeepEvalBaseLLM):
    """A DeepEval judge backed by one of our LangChain chat models; it counts its own cost."""

    def __init__(self, chat: BaseChatModel, name: str, price: ModelPrice) -> None:
        """Judge with `chat`, priced at `price`."""
        self._chat = chat
        self._name = name
        self._price = price
        self.cost_usd = 0.0
        super().__init__(name)

    def load_model(  # pyright: ignore[reportIncompatibleMethodOverride] -- DeepEval's own docs return the wrapped client here
        self, *args: object, **kwargs: object
    ) -> BaseChatModel:
        """The chat model DeepEval stores as `self.model` (it calls us through `a_generate`)."""
        return self._chat

    def get_model_name(self) -> str:
        """The name DeepEval prints in its reports."""
        return self._name

    def generate(self, prompt: str) -> str:
        """Not used: metrics run in async mode."""
        msg = "the eval judge is async only"
        raise NotImplementedError(msg)

    async def a_generate(self, prompt: str) -> str:
        """Answer one judging prompt with text; DeepEval parses the JSON it asks for.

        No `schema` parameter on purpose: DeepEval then falls back to parsing the text, which
        works the same for every provider (its prompts spell out the JSON they expect).
        """
        message = await self._chat.ainvoke(prompt)
        self.cost_usd += estimate_cost_usd(self._price, token_usage(message))
        return message.text


@dataclass(frozen=True, slots=True)
class Judgement:
    """The judge's scores for one answer, 0..1."""

    faithfulness: float
    answer_relevancy: float


async def judge_answer(
    judge: LangChainJudge, question: str, answer: str, contexts: Sequence[str]
) -> Judgement:
    """Score one answer against the question and the chunks it was written from."""
    case = LLMTestCase(input=question, actual_output=answer, retrieval_context=list(contexts))
    # `include_reason=False`: the reasons cost extra calls; the scores are what the run checks.
    faithfulness = FaithfulnessMetric(model=judge, include_reason=False, async_mode=True)
    relevancy = AnswerRelevancyMetric(model=judge, include_reason=False, async_mode=True)
    await faithfulness.a_measure(case, _show_indicator=False)
    await relevancy.a_measure(case, _show_indicator=False)
    return Judgement(
        faithfulness=float(faithfulness.score or 0.0),
        answer_relevancy=float(relevancy.score or 0.0),
    )


class DeepEvalJudge:
    """The runner's judge: both DeepEval metrics on one LangChain judge model."""

    def __init__(self, chat: BaseChatModel, name: str, price: ModelPrice) -> None:
        """Judge with `chat`, priced at `price`."""
        self._judge = LangChainJudge(chat, name, price)

    @property
    def cost_usd(self) -> float:
        """What the judge has cost so far."""
        return self._judge.cost_usd

    async def scores(
        self, question: str, answer: str, contexts: Sequence[str]
    ) -> tuple[float, float]:
        """Faithfulness and answer relevancy, 0..1."""
        judgement = await judge_answer(self._judge, question, answer, contexts)
        return judgement.faithfulness, judgement.answer_relevancy
