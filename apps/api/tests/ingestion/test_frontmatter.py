"""Splitting YAML frontmatter from a Markdown body (ROADMAP 3.2)."""

import datetime

import pytest

from site_api.ingestion.frontmatter import split_frontmatter

pytestmark = pytest.mark.mentor_pending


def test_returns_the_mapping_and_the_body() -> None:
    text = "---\ntitle: Notes\ncategory: experience\n---\n\n# Notes\n\nBody text.\n"

    meta, body = split_frontmatter(text)

    assert meta == {"title": "Notes", "category": "experience"}
    assert body == "# Notes\n\nBody text.\n"


def test_yaml_values_keep_their_types() -> None:
    # PyYAML turns an unquoted ISO date into `datetime.date`; a `YYYY-MM` month stays a string.
    meta, _ = split_frontmatter("---\nupdated: 2026-11-01\nstart: 2024-11\n---\n")

    assert meta == {"updated": datetime.date(2026, 11, 1), "start": "2024-11"}


def test_frontmatter_only_file_has_an_empty_body() -> None:
    # CV entries such as skills.md are all frontmatter; the last line may lack a newline.
    meta, body = split_frontmatter("---\nsection: skills\n---")

    assert meta == {"section": "skills"}
    assert body == ""


def test_text_without_frontmatter_is_all_body() -> None:
    text = "# SPEC\n\n---\n\nA horizontal rule is not frontmatter.\n"

    assert split_frontmatter(text) == ({}, text)


def test_unclosed_frontmatter_is_an_error() -> None:
    with pytest.raises(ValueError, match="frontmatter"):
        split_frontmatter("---\ntitle: Notes\n\n# Notes\n")


def test_frontmatter_must_be_a_mapping() -> None:
    with pytest.raises(ValueError, match="mapping"):
        split_frontmatter("---\n- a\n- b\n---\nBody\n")
