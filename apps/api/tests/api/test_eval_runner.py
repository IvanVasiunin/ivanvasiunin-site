"""The eval runner through the real `ChatService` on fakes (ROADMAP 4.5): no model is called."""

from collections.abc import Sequence

import pytest
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.core.config import Settings
from site_api.evals.cases import EvalCase
from site_api.evals.runner import RecordingRetriever, run_cases
from site_api.graph.nodes import ChatModels
from site_api.services.chat import ChatService
from site_api.services.limits import DailySpend

from .chat_fakes import FakeRetriever, answering, routing


class EvalSettings(Settings):
    """Settings without the developer's `.env`."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")


SETTINGS = EvalSettings(database_url=SecretStr("postgresql+psycopg://site@127.0.0.1:9/unused"))


def case(**values: object) -> EvalCase:
    base: dict[str, object] = {
        "id": "a-case",
        "type": "in_scope",
        "language": "en",
        "question": "What does Ivan do?",
        "route": "about_ivan",
        "finish": ["stop"],
    }
    return EvalCase.model_validate({**base, **values})


class FakeJudge:
    def __init__(self) -> None:
        self.cost_usd = 0.0
        self.asked: list[tuple[str, list[str]]] = []

    async def scores(
        self, question: str, answer: str, contexts: Sequence[str]
    ) -> tuple[float, float]:
        self.asked.append((question, list(contexts)))
        self.cost_usd += 0.001
        return 0.9, 0.8


async def test_the_runner_asks_checks_and_judges_through_the_real_service() -> None:
    retriever = RecordingRetriever(FakeRetriever())
    service = ChatService(
        retriever, ChatModels(routing(), answering("Ivan builds UI.")), SETTINGS, DailySpend(1.0)
    )
    judge = FakeJudge()
    judged = case(id="judged", judged=True, sources=True)

    results = await run_cases(service, retriever, [judged], judge)

    (result,) = results
    assert result.rules_passed
    assert (result.faithfulness, result.answer_relevancy) == (0.9, 0.8)
    assert result.judge_cost_usd == pytest.approx(0.001)
    # The judge reads the full text of the chunks the answer was written from.
    (_, contexts) = judge.asked[0]
    assert "Builds and reviews UI" in contexts[0]


async def test_a_template_is_never_judged() -> None:
    retriever = RecordingRetriever(FakeRetriever())
    service = ChatService(
        retriever,
        ChatModels(routing("greeting"), answering("unused")),
        SETTINGS,
        DailySpend(1.0),
    )
    judge = FakeJudge()

    (result,) = await run_cases(
        service, retriever, [case(route="greeting", finish=["templated"], judged=False)], judge
    )

    assert result.rules_passed
    assert judge.asked == []


class BrokenJudge:
    """A judge whose reply never parses, like a cut-off JSON."""

    def __init__(self) -> None:
        self.cost_usd = 0.0

    async def scores(
        self, question: str, answer: str, contexts: Sequence[str]
    ) -> tuple[float, float]:
        self.cost_usd += 0.002
        raise ValueError


async def test_a_judge_failure_costs_its_case_the_scores_not_the_whole_run() -> None:
    retriever = RecordingRetriever(FakeRetriever())
    service = ChatService(
        retriever, ChatModels(routing(), answering("Ivan builds UI.")), SETTINGS, DailySpend(1.0)
    )
    cases = [case(id="first", judged=True), case(id="second", judged=True)]

    results = await run_cases(service, retriever, cases, BrokenJudge())

    assert [r.case.id for r in results] == ["first", "second"]
    assert all(r.faithfulness is None and r.judge_error == "ValueError" for r in results)
    # The failed judging was still paid for.
    assert results[0].judge_cost_usd == pytest.approx(0.002)


async def test_a_run_stops_before_the_next_case_once_it_hits_its_cost_cap() -> None:
    retriever = RecordingRetriever(FakeRetriever())
    service = ChatService(
        retriever, ChatModels(routing(), answering("Ivan builds UI.")), SETTINGS, DailySpend(1.0)
    )
    cases = [case(id=f"case-{n}") for n in range(5)]

    # One answer costs ~$0.0005 (router + answer): a cap of $0.0001 stops after the first.
    results = await run_cases(service, retriever, cases, None, max_cost_usd=0.0001)

    assert [r.case.id for r in results] == ["case-0"]
