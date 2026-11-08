"""The eval suite's free parts (ROADMAP 4.5): cases, rule checks, estimate, report, runner, judge.

Nothing here calls a model: the runner gets the real `ChatService` on fakes, the judge a fake chat
model.
"""

import uuid

import pytest
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, GenericFakeChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import SecretStr
from pydantic_settings import SettingsConfigDict

from site_api.core.config import ModelPrice, Settings
from site_api.evals.cases import EVAL_LANGUAGES, EvalCase, load_cases
from site_api.evals.checks import Answer, check_answer, contains_phrase, read_answer
from site_api.evals.estimate import estimate_run
from site_api.evals.judge import DeepEvalJudge, LangChainJudge
from site_api.evals.report import CaseResult, build_report
from site_api.schemas.chat import (
    DoneEvent,
    RouteEvent,
    SourceItem,
    SourcesEvent,
    TokenEvent,
    UsageEvent,
)


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


def answer(**values: object) -> Answer:
    base: dict[str, object] = {
        "route": "about_ivan",
        "language": "en",
        "text": "Ivan builds UI at BrainRocket.",
        "source_count": 2,
        "finish_reason": "stop",
        "error_code": None,
        "cost_usd": 0.0005,
    }
    return Answer(**{**base, **values})  # pyright: ignore[reportArgumentType] -- test data


# ── The cases ─────────────────────────────────────────────────────────────────────────────────


def test_the_suite_covers_every_case_type_in_every_language_it_promises() -> None:
    cases = load_cases()

    # ADR-0004: six case types (plus greetings), questions in EN / ES / RU / UK.
    assert {c.type for c in cases} >= {
        "in_scope",
        "personal",
        "off_topic",
        "injection",
        "unknown_fact",
        "nda_salary",
    }
    assert {c.language for c in cases} == set(EVAL_LANGUAGES)


def test_every_case_expects_a_class_consistent_with_its_finish() -> None:
    for c in load_cases():
        if c.route == "about_ivan":
            assert set(c.finish) <= {"stop", "length", "no_info"}, c.id
        else:
            assert c.finish == ["templated"], c.id


def test_only_answers_about_ivan_are_judged() -> None:
    assert all(c.route == "about_ivan" for c in load_cases() if c.judged)


# ── Rule checks ───────────────────────────────────────────────────────────────────────────────


def test_events_become_one_answer() -> None:
    item = SourceItem(
        chunk_id="cv:a:0", score=0.9, source_type="cv", title="CV — A", snippet="text"
    )
    events = [
        RouteEvent(type="route", route="about_ivan", language="en"),
        SourcesEvent(type="sources", items=[item]),
        TokenEvent(type="token", text="Ivan "),
        TokenEvent(type="token", text="builds UI."),
        UsageEvent(type="usage", nodes=[], total_ms=5, estimated_cost_usd=0.0004),
        DoneEvent(type="done", message_id=uuid.uuid4(), finish_reason="stop"),
    ]

    read = read_answer(events)

    assert (read.route, read.text, read.source_count, read.finish_reason) == (
        "about_ivan",
        "Ivan builds UI.",
        1,
        "stop",
    )
    assert read.cost_usd == pytest.approx(0.0004)


def test_a_good_answer_passes_every_check() -> None:
    checks = check_answer(case(sources=True, contains_any=["brainrocket"]), answer())

    assert all(check.passed for check in checks)


@pytest.mark.parametrize(
    ("answer_values", "case_values", "failed"),
    [
        ({"route": "off_topic"}, {}, "route"),
        ({"finish_reason": "no_info"}, {}, "finish"),
        ({"source_count": 0}, {"sources": True}, "sources"),
        ({"text": "Something else."}, {"contains_any": ["BrainRocket"]}, "contains_any"),
        ({"text": "He wants $5000."}, {"contains_none": ["$"]}, "contains_none"),
        (
            {"text": "BrainRocket only."},
            {"contains_all": ["BrainRocket", "Liketelecom"]},
            "contains_all",
        ),
        ({"error_code": "timeout"}, {}, "no_error"),
    ],
)
def test_each_rule_fails_on_its_own(
    answer_values: dict[str, object], case_values: dict[str, object], failed: str
) -> None:
    checks = check_answer(case(**case_values), answer(**answer_values))

    assert [check.name for check in checks if not check.passed] == [failed]


# ── Estimate and report ───────────────────────────────────────────────────────────────────────


def test_the_estimate_prices_only_the_calls_each_case_makes() -> None:
    templated = case(id="t", route="greeting", finish=["templated"])
    judged = case(id="j", judged=True)

    only_router = estimate_run([templated], SETTINGS)
    full = estimate_run([judged], SETTINGS)

    assert only_router.answer_usd == 0
    assert only_router.judge_usd == 0
    assert full.answer_usd > 0
    assert full.judge_usd > 0
    assert full.total_usd > only_router.total_usd


def _result(route_ok: bool, rules_ok: bool, faithfulness: float | None = None) -> CaseResult:
    c = case(contains_any=["BrainRocket"])
    a = answer(route="about_ivan" if route_ok else "off_topic")
    if not rules_ok:
        a = answer(route=a.route, text="Nothing relevant.")
    return CaseResult(case=c, answer=a, checks=check_answer(c, a), faithfulness=faithfulness)


def test_the_report_passes_when_every_metric_reaches_its_threshold() -> None:
    report = build_report([_result(True, True, 0.9), _result(True, True, 0.85)], SETTINGS)

    assert report.passed
    assert report.router_accuracy == 1.0
    assert report.faithfulness == pytest.approx(0.875)
    assert report.failures == {}


def test_the_report_fails_on_low_router_accuracy_and_names_the_failed_cases() -> None:
    report = build_report([_result(False, False), _result(True, True)], SETTINGS)

    assert not report.passed
    assert report.router_accuracy == 0.5
    assert report.router_accuracy_by_class == {"about_ivan": 0.5}
    assert "a-case" in report.failures


def test_the_report_names_a_judged_case_the_judge_left_unscored() -> None:
    c = case(judged=True, contains_any=["BrainRocket"])
    a = answer()
    result = CaseResult(case=c, answer=a, checks=check_answer(c, a), judge_error="ValueError")

    report = build_report([result], SETTINGS)

    assert report.failures == {"a-case": ["judge: ValueError"]}


def test_unmeasured_judge_scores_do_not_fail_a_run() -> None:
    report = build_report([_result(True, True)], SETTINGS)

    assert report.faithfulness is None
    assert report.passed


# ── Judge ──────────────────────────────────────────────────────────────────────────────────────


async def test_the_judge_answers_with_text_and_counts_its_cost() -> None:
    reply = AIMessage(
        content='{"verdicts": []}',
        usage_metadata={"input_tokens": 1000, "output_tokens": 100, "total_tokens": 1100},
    )
    chat = GenericFakeChatModel(messages=iter([reply]))
    judge = LangChainJudge(chat, "gpt-6-luna", ModelPrice(input=0.1, cached_input=0.01, output=0.5))

    text = await judge.a_generate("Judge this.")

    assert text == '{"verdicts": []}'
    # 1000 * $0.10 + 100 * $0.50, per 1M tokens.
    assert judge.cost_usd == pytest.approx(0.00015)


# ── Review fixes: whole words, language, coverage ─────────────────────────────────────────────


@pytest.mark.parametrize(
    ("text", "phrase", "found"),
    [
        ("He can maintain it.", "AI", False),
        ("He builds AI products.", "AI", True),
        ("A standard approach.", "NDA", False),
        ("That is covered by NDA.", "NDA", True),
        ("Ivan hasn\N{RIGHT SINGLE QUOTATION MARK}t shared that.", "hasn't shared", True),
        ("He joined in 2018.", "8", False),
        ("He wants $5000.", "$", True),
        ("NumbersValidator checks numbers.", "number", False),
    ],
)
def test_phrases_match_as_whole_words(text: str, phrase: str, found: bool) -> None:
    assert contains_phrase(text, phrase) is found


def test_an_answer_in_the_wrong_language_fails() -> None:
    checks = check_answer(case(language="es"), answer(language="en"))

    assert [check.name for check in checks if not check.passed] == ["language"]


def test_a_judged_case_the_judge_could_not_score_fails_the_run() -> None:
    judged = case(judged=True, contains_any=["BrainRocket"])
    a = answer()
    unmeasured = CaseResult(case=judged, answer=a, checks=check_answer(judged, a))
    measured = CaseResult(
        case=judged,
        answer=a,
        checks=check_answer(judged, a),
        faithfulness=0.9,
        answer_relevancy=0.9,
    )

    report = build_report([unmeasured, measured], SETTINGS)

    coverage = next(t for t in report.thresholds if t.metric == "judge_coverage")
    assert coverage.value == 0.5
    assert not report.passed


def test_the_report_keeps_each_answer_for_reading_and_marks_each_threshold() -> None:
    c = case(contains_any=["BrainRocket"])
    a = answer()
    report = build_report([CaseResult(case=c, answer=a, checks=check_answer(c, a))], SETTINGS)

    data = report.to_json()
    assert data["answers"] == {"a-case": "Ivan builds UI at BrainRocket."}
    assert all("passed" in threshold for threshold in data["thresholds"])  # type: ignore[union-attr]


# ── The DeepEval path, on a judge model that answers its prompts ──────────────────────────────


class PromptedJudgeChat(BaseChatModel):
    """Answers DeepEval's five judging prompts with fixed JSON, by recognising each prompt."""

    @property
    def _llm_type(self) -> str:
        return "judge-fake"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: object,
    ) -> ChatResult:
        prompt = messages[-1].text
        if prompt.startswith("Based on the given claims"):
            reply = '{"verdicts": [{"verdict": "yes"}, {"verdict": "no", "reason": "x"}]}'
        elif prompt.startswith("For the provided list of statements"):
            reply = '{"verdicts": [{"verdict": "yes"}]}'
        elif prompt.startswith("Given the text, breakdown"):
            reply = '{"statements": ["Ivan builds UI."]}'
        elif "please extract a comprehensive list of FACTUAL" in prompt:
            reply = '{"claims": ["Ivan builds UI.", "Ivan works at Google."]}'
        else:
            reply = '{"truths": ["Ivan builds UI at BrainRocket."]}'
        message = AIMessage(
            content=reply,
            usage_metadata={"input_tokens": 100, "output_tokens": 10, "total_tokens": 110},
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


async def test_the_deepeval_judge_scores_an_answer_end_to_end_without_a_real_model() -> None:
    judge = DeepEvalJudge(
        PromptedJudgeChat(), "gpt-6-luna", ModelPrice(input=0.1, cached_input=0.01, output=0.5)
    )

    faithfulness, relevancy = await judge.scores(
        "What does Ivan do?",
        "Ivan builds UI. He works at Google.",
        ["Ivan builds UI at BrainRocket."],
    )

    # One of two claims is contradicted; the one statement is relevant.
    assert faithfulness == pytest.approx(0.5)
    assert relevancy == pytest.approx(1.0)
    assert judge.cost_usd > 0
