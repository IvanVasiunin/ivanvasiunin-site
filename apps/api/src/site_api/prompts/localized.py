"""Elio's templated answers (SPEC §5.1): what it says without calling the answer model.

Greetings, off-topic questions, injection attempts and rude messages get a fixed answer in the
question's language: no retrieval, no answer model, so they cost only the router call (ADR-0004).
So do questions nothing retrieved is close to (the relevance gate's `no_info`). The texts
live in versioned YAML files (`templates/<lang>.yaml`), never in code; English is the fallback for
any language without a file. (This module is not named `templates.py`: a module and a folder of
the same name side by side would make `import site_api.prompts.templates` ambiguous to a reader.)
"""

from functools import cache
from importlib.resources import files
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

# The languages with their own templates (SPEC §5.1); every other language gets English.
TEMPLATE_LANGUAGES: tuple[str, ...] = ("en", "es", "ru", "uk")
FALLBACK_LANGUAGE = "en"

# The router classes answered by a template (all but `about_ivan`), and the relevance gate's answer.
type RouteTemplate = Literal["greeting", "off_topic", "injection", "rude"]
type TemplateName = RouteTemplate | Literal["no_info"]


class Templates(BaseModel):
    """One language's templates; a missing, empty or unknown key fails at load time."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    greeting: str = Field(min_length=1)
    off_topic: str = Field(min_length=1)
    injection: str = Field(min_length=1)
    # Insults and crude jokes (SPEC §5.1, 2026-11-08): keep it respectful, offer real topics.
    rude: str = Field(min_length=1)
    # The relevance gate's answer (SPEC §5.2): nothing retrieved is close enough to answer from.
    no_info: str = Field(min_length=1)


def load_templates(language: str) -> Templates:
    """The templates of `language`, or English when it has none."""
    return _load(language if language in TEMPLATE_LANGUAGES else FALLBACK_LANGUAGE)


@cache
def _load(code: str) -> Templates:
    """Read one language's file once; keyed by the four known codes only, never by visitor input."""
    text = (files("site_api.prompts") / "templates" / f"{code}.yaml").read_text(encoding="utf-8")
    # `safe_load` builds only plain data (str, list, dict): never Python objects from tags.
    return Templates.model_validate(yaml.safe_load(text))


def template_answer(name: TemplateName, language: str) -> str:
    """The templated answer `name` in `language` (or English), without a trailing newline."""
    templates = load_templates(language)
    match name:
        case "greeting":
            text = templates.greeting
        case "off_topic":
            text = templates.off_topic
        case "injection":
            text = templates.injection
        case "rude":
            text = templates.rude
        case "no_info":
            text = templates.no_info
    return text.rstrip("\n")


def warm_up() -> None:
    """Read every template file now, at startup, so no request waits on disk I/O."""
    for code in TEMPLATE_LANGUAGES:
        _load(code)
