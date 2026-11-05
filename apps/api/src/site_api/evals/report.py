"""A run's results: per case, per class, against the thresholds in config (ROADMAP 4.5).

The report is plain data, so it can be printed, saved as JSON next to the docs and compared
between prompt versions (the `prompt-change` skill).
"""

from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from statistics import fmean

from site_api.core.config import Settings
from site_api.evals.cases import EvalCase
from site_api.evals.checks import Answer, CheckResult

# How much of each answer the report keeps (answers are public anyway; this keeps files small).
ANSWER_KEPT_CHARS = 600


@dataclass(frozen=True, slots=True)
class CaseResult:
    """One case: what came back, which checks failed and, if judged, the judge's scores."""

    case: EvalCase
    answer: Answer
    checks: list[CheckResult]
    faithfulness: float | None = None
    answer_relevancy: float | None = None
    judge_cost_usd: float = 0.0
    # The judge's exception type when its reply could not be used (the scores stay unmeasured).
    judge_error: str | None = None

    @property
    def rules_passed(self) -> bool:
        """Every rule check passed."""
        return all(check.passed for check in self.checks)

    @property
    def failed_checks(self) -> list[str]:
        """The failed checks, with their details."""
        return [f"{check.name}: {check.detail}" for check in self.checks if not check.passed]


@dataclass(frozen=True, slots=True)
class Threshold:
    """One metric against its minimum."""

    metric: str
    value: float | None
    minimum: float

    @property
    def passed(self) -> bool:
        """A metric with no value (nothing was measured) does not fail the run."""
        return self.value is None or self.value >= self.minimum


@dataclass(frozen=True, slots=True)
class RunReport:
    """The whole run: metrics, thresholds, cost and the cases that failed."""

    cases: int
    router_accuracy: float
    router_accuracy_by_class: dict[str, float]
    rule_pass_rate: float
    rule_pass_rate_by_type: dict[str, float]
    rule_pass_rate_by_language: dict[str, float]
    faithfulness: float | None
    answer_relevancy: float | None
    cost_usd: float
    thresholds: list[Threshold]
    failures: dict[str, list[str]] = field(default_factory=dict[str, list[str]])
    # Every case's answer text (cut), so a failure can be read, not only counted.
    answers: dict[str, str] = field(default_factory=dict[str, str])

    @property
    def passed(self) -> bool:
        """Whether every metric reached its threshold."""
        return all(threshold.passed for threshold in self.thresholds)

    def to_json(self) -> dict[str, object]:
        """The report as JSON-ready data (for docs/evals/)."""
        data = asdict(self)
        data["passed"] = self.passed
        data["thresholds"] = [
            {**asdict(threshold), "passed": threshold.passed} for threshold in self.thresholds
        ]
        return data


def build_report(results: Sequence[CaseResult], settings: Settings) -> RunReport:
    """Aggregate the case results and compare them with the thresholds in config."""
    router_ok = [result.answer.route == result.case.route for result in results]
    faithfulness = _mean([r.faithfulness for r in results])
    relevancy = _mean([r.answer_relevancy for r in results])
    router_accuracy = _rate(router_ok)
    rule_pass_rate = _rate([result.rules_passed for result in results])
    # Judged cases the judge actually scored: an unmeasured case must not let a run pass on the
    # mean of the others (an empty database would leave every score unmeasured).
    judged = [r for r in results if r.case.judged]
    judge_coverage = _rate([r.faithfulness is not None for r in judged]) if judged else None
    return RunReport(
        cases=len(results),
        router_accuracy=router_accuracy,
        router_accuracy_by_class=_rate_by(
            results, lambda r: r.case.route, lambda r: r.answer.route == r.case.route
        ),
        rule_pass_rate=rule_pass_rate,
        rule_pass_rate_by_type=_rate_by(results, lambda r: r.case.type, lambda r: r.rules_passed),
        rule_pass_rate_by_language=_rate_by(
            results, lambda r: r.case.language, lambda r: r.rules_passed
        ),
        faithfulness=faithfulness,
        answer_relevancy=relevancy,
        cost_usd=round(sum(r.answer.cost_usd + r.judge_cost_usd for r in results), 4),
        thresholds=[
            Threshold("router_accuracy", router_accuracy, settings.eval_min_router_accuracy),
            Threshold("rule_pass_rate", rule_pass_rate, settings.eval_min_rule_pass_rate),
            Threshold("faithfulness", faithfulness, settings.eval_min_faithfulness),
            Threshold("answer_relevancy", relevancy, settings.eval_min_answer_relevancy),
            Threshold("judge_coverage", judge_coverage, 1.0),
        ],
        failures={r.case.id: r.failed_checks for r in results if not r.rules_passed},
        answers={r.case.id: r.answer.text[:ANSWER_KEPT_CHARS] for r in results},
    )


def format_report(report: RunReport) -> str:
    """The report as the lines the CLI prints."""
    lines = [f"Cases: {report.cases}. Cost: ${report.cost_usd:.4f}."]
    for threshold in report.thresholds:
        value = "n/a" if threshold.value is None else f"{threshold.value:.2f}"
        mark = "ok" if threshold.passed else "FAIL"
        lines.append(f"  {threshold.metric}: {value} (min {threshold.minimum:.2f}) {mark}")
    for case_id, failed in report.failures.items():
        lines.append(f"  failed {case_id}: {'; '.join(failed)}")
    lines.append("PASSED" if report.passed else "FAILED")
    return "\n".join(lines)


def _rate(flags: Sequence[bool]) -> float:
    """The share of true flags, 0..1 (1 for no flags: nothing failed)."""
    return round(sum(flags) / len(flags), 4) if flags else 1.0


def _mean(values: Sequence[float | None]) -> float | None:
    """The mean of the measured values, or `None` when nothing was measured."""
    measured = [value for value in values if value is not None]
    return round(fmean(measured), 4) if measured else None


def _rate_by(
    results: Sequence[CaseResult],
    key: Callable[[CaseResult], str],
    ok: Callable[[CaseResult], bool],
) -> dict[str, float]:
    """The pass rate within each group of results (by class, type or language)."""
    groups: dict[str, list[bool]] = defaultdict(list[bool])
    for result in results:
        groups[key(result)].append(ok(result))
    return {name: _rate(flags) for name, flags in sorted(groups.items())}
