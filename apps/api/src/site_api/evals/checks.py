"""The free part of grading: rule checks on one answer's events (ROADMAP 4.5).

Route, finish reason, sources and required / forbidden phrases need no model: they are checked
on the SSE events the graph produced. The judge's scores (faithfulness, relevancy) are separate
and paid (`evals/judge.py`).
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from site_api.evals.cases import EvalCase
from site_api.schemas.chat import (
    ChatEvent,
    DoneEvent,
    ErrorEvent,
    RouteEvent,
    SourcesEvent,
    TokenEvent,
    UsageEvent,
)


@dataclass(frozen=True, slots=True)
class Answer:
    """What one run of the graph produced, read from its events."""

    route: str | None
    language: str | None
    text: str
    source_count: int
    finish_reason: str | None
    error_code: str | None
    cost_usd: float


@dataclass(frozen=True, slots=True)
class CheckResult:
    """One check of one case: its name, whether it passed, and why not."""

    name: str
    passed: bool
    detail: str = ""


def read_answer(events: Sequence[ChatEvent]) -> Answer:
    """Collect the route, the text, the sources, the end and the cost from the events."""
    route = next((event for event in events if isinstance(event, RouteEvent)), None)
    sources = next((event for event in events if isinstance(event, SourcesEvent)), None)
    done = next((event for event in events if isinstance(event, DoneEvent)), None)
    error = next((event for event in events if isinstance(event, ErrorEvent)), None)
    usage = next((event for event in events if isinstance(event, UsageEvent)), None)
    return Answer(
        route=route.route if route else None,
        language=route.language if route else None,
        text="".join(event.text for event in events if isinstance(event, TokenEvent)),
        source_count=len(sources.items) if sources else 0,
        finish_reason=done.finish_reason if done else None,
        error_code=error.code if error else None,
        cost_usd=usage.estimated_cost_usd if usage else 0.0,
    )


def check_answer(case: EvalCase, answer: Answer) -> list[CheckResult]:
    """Every rule check the case asks for, in a fixed order."""
    results = [
        CheckResult("no_error", answer.error_code is None, answer.error_code or ""),
        CheckResult("route", answer.route == case.route, f"got {answer.route}"),
        CheckResult("finish", answer.finish_reason in case.finish, f"got {answer.finish_reason}"),
    ]
    if case.sources is not None:
        has_sources = answer.source_count > 0
        results.append(
            CheckResult("sources", has_sources == case.sources, f"{answer.source_count} sources")
        )
    if answer.language is not None:
        # SPEC §5.2: the answer comes in the language of the question.
        results.append(
            CheckResult("language", answer.language == case.language, f"got {answer.language}")
        )
    if case.contains_any:
        found = any(contains_phrase(answer.text, phrase) for phrase in case.contains_any)
        results.append(CheckResult("contains_any", found, "none of the expected phrases"))
    for phrase in case.contains_none:
        results.append(
            CheckResult(
                "contains_none", not contains_phrase(answer.text, phrase), f"contains {phrase!r}"
            )
        )
    return results


# Typographic quotes and apostrophes a model may write instead of the plain ones.
_QUOTES = str.maketrans({chr(0x2019): "'", chr(0x2018): "'", chr(0x201C): '"', chr(0x201D): '"'})


def contains_phrase(text: str, phrase: str) -> bool:
    """Whether `text` contains `phrase` as whole words, ignoring case and curly quotes.

    Whole words: `AI` must not match inside "maintain", nor `NDA` inside "standard". A phrase
    that starts or ends with a symbol (`$`, `€`) matches wherever the symbol appears.
    """
    normalized = text.translate(_QUOTES).casefold()
    needle = phrase.translate(_QUOTES).casefold()
    start = r"(?<!\w)" if needle[:1].isalnum() else ""
    end = r"(?!\w)" if needle[-1:].isalnum() else ""
    return re.search(f"{start}{re.escape(needle)}{end}", normalized) is not None
