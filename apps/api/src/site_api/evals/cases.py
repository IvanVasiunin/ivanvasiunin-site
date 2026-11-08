"""Eval cases: what Elio is asked and what a good answer must (not) do (ROADMAP 4.5, SPEC §5).

The cases live in `cases.yaml`, next to this module; this module only loads and validates them,
so a typo in a case fails at load time, not halfway through a paid run.
"""

from functools import cache
from importlib.resources import files
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from site_api.schemas.chat import ChatTurn, FinishReason, Route

# ADR-0004 layer 6: the six case types (plus greetings, which the router also has to recognise).
type CaseType = Literal[
    "in_scope",
    "personal",
    "off_topic",
    "injection",
    "greeting",
    "unknown_fact",
    "nda_salary",
    "rude",
]
EVAL_LANGUAGES: tuple[str, ...] = ("en", "es", "ru", "uk")


class EvalCase(BaseModel):
    """One question and the checks its answer must pass."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    type: CaseType
    language: Literal["en", "es", "ru", "uk"]
    question: str = Field(min_length=1, max_length=5000)
    # Earlier turns, oldest first, sent as the request's history (a continued conversation).
    history: list[ChatTurn] = Field(default_factory=list[ChatTurn])
    route: Route
    # Any of these finish reasons passes.
    finish: list[FinishReason] = Field(min_length=1)
    sources: bool | None = None
    contains_any: list[str] = Field(default_factory=list[str])
    # Every one of these (a broad question must cover more than one fact).
    contains_all: list[str] = Field(default_factory=list[str])
    contains_none: list[str] = Field(default_factory=list[str])
    # In-scope answers also get the judge's faithfulness and relevancy scores (paid).
    judged: bool = False


class EvalSuite(BaseModel):
    """The whole file: a list of cases with unique ids."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    cases: list[EvalCase] = Field(min_length=1)


@cache
def load_cases() -> tuple[EvalCase, ...]:
    """Read and validate `cases.yaml` (once); duplicate ids fail."""
    text = (files("site_api.evals") / "cases.yaml").read_text(encoding="utf-8")
    suite = EvalSuite.model_validate(yaml.safe_load(text))
    ids = [case.id for case in suite.cases]
    duplicates = sorted({case_id for case_id in ids if ids.count(case_id) > 1})
    if duplicates:
        msg = f"duplicate eval case ids: {', '.join(duplicates)}"
        raise ValueError(msg)
    return tuple(suite.cases)
