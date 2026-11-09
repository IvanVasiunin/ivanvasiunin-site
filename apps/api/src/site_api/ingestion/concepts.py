"""The knowledge map's concepts: names a guest recognises, found in chunk texts (ROADMAP 6.2).

The map shows chunks as stars; an answer's "Topics" line names the concepts the answer mentions
that the read chunks mention too (SPEC US-A12). Which chunk mentions which concept is worked out
here, at ingestion, so the browser gets only concept ids (`points.json`, SPEC §4.4), never text.
"""

import re
from functools import cache
from importlib.resources import files

import yaml
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from site_api.schemas.chat import SourceType


class Concept(BaseModel):
    """One entry of `concepts.yaml`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    label: str = Field(min_length=1)
    aliases: tuple[str, ...] = Field(min_length=1)
    # Source types where the word means something else (site docs' "mentor mode").
    not_in: tuple[SourceType, ...] = ()


@cache
def load_concepts() -> tuple[Concept, ...]:
    """The catalogue, validated; ids must be unique."""
    text = (files("site_api.ingestion") / "concepts.yaml").read_text(encoding="utf-8")
    concepts = TypeAdapter(tuple[Concept, ...]).validate_python(yaml.safe_load(text))
    ids = [concept.id for concept in concepts]
    if len(set(ids)) != len(ids):
        raise ValueError("concepts.yaml: duplicate concept ids")
    return concepts


def alias_pattern(aliases: tuple[str, ...]) -> re.Pattern[str]:
    """Any alias as a whole word, any case.

    A plain word boundary does not see word edges next to Cyrillic letters in every engine, so
    the edges are explicit: no word character (or hyphen) right before, no word character right
    after. The browser builds the same pattern from the same aliases (lib/viz/topics.ts).
    """
    body = "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))
    return re.compile(rf"(?<![\w-])(?:{body})(?!\w)", re.IGNORECASE)


@cache
def _patterns() -> tuple[tuple[Concept, re.Pattern[str]], ...]:
    return tuple((concept, alias_pattern(concept.aliases)) for concept in load_concepts())


def concepts_in(text: str, source_type: SourceType) -> list[str]:
    """The ids of the concepts this chunk mentions, in catalogue order."""
    return [
        concept.id
        for concept, pattern in _patterns()
        if source_type not in concept.not_in and pattern.search(text)
    ]
