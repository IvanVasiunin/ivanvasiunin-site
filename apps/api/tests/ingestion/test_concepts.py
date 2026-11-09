"""The knowledge map's concept catalogue and matching (ROADMAP 6.2, SPEC §4.4)."""

from pathlib import Path
from typing import cast

import pytest
import yaml

from site_api.ingestion.concepts import concepts_in, load_concepts

CV_DIR = Path(__file__).resolve().parents[4] / "apps" / "web" / "src" / "content" / "cv"


def test_the_catalogue_loads_with_unique_ids() -> None:
    ids = [concept.id for concept in load_concepts()]

    assert len(ids) == len(set(ids))
    assert len(ids) >= 40


def _frontmatter(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    return yaml.safe_load(text.split("---")[1])


def _cv_names() -> list[str]:
    skills = _frontmatter(CV_DIR / "skills.md")
    groups = cast("list[dict[str, list[str]]]", skills["groups"])
    names = [item for group in groups for item in group["items"]]
    names += [str(_frontmatter(path)["company"]) for path in sorted((CV_DIR / "jobs").glob("*.md"))]
    names += [
        str(_frontmatter(path)["name"]) for path in sorted((CV_DIR / "projects").glob("*.md"))
    ]
    return names


def test_every_cv_skill_company_and_project_is_a_concept() -> None:
    # A skill added to the CV must be added to concepts.yaml too, or no answer ever names it.
    missing = [name for name in _cv_names() if not concepts_in(name, "cv")]

    assert missing == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("He mentored developers and reviews code.", ["code-review", "mentoring"]),
        ("Angular, SCSS / Sass and TypeScript", ["scss", "typescript", "angular"]),
        ("Мой ментор был строгим", ["mentoring"]),
        ("A reactive form, a dogma, Javascripting", []),
        ("REACT and react-dom", ["react"]),
    ],
)
def test_aliases_match_whole_words_in_any_case(text: str, expected: list[str]) -> None:
    assert concepts_in(text, "experience") == expected


def test_a_word_that_means_something_else_in_site_docs_is_left_out() -> None:
    # Site docs speak of "mentor mode", a way of working in this repository.
    assert concepts_in("Mentor mode applies to the AI core", "site_docs") == []
    assert concepts_in("Mentor mode applies to the AI core", "experience") == ["mentoring"]
