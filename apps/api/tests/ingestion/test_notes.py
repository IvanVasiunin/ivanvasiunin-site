"""Loading the hand-written notes in `data/*.md` (ROADMAP 3.2)."""

import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from site_api.ingestion.notes import load_notes

EXPERIENCE = """---
title: Experience notes — Ivan Vasiunin
category: experience
source: experience-notes.md
---

# Experience notes — Ivan Vasiunin

## Summary

Ivan builds interfaces.
"""

PERSONAL = """---
title: About Ivan — personal information
category: personal
source: about-me-personal.md
updated: 2026-11-01
---

# About Ivan

### Does he have a pet?
Yes.
"""


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    (tmp_path / "experience-notes.md").write_text(EXPERIENCE, encoding="utf-8")
    (tmp_path / "about-me-personal.md").write_text(PERSONAL, encoding="utf-8")
    # data/raw/ holds the Word CV with the phone number: it must never be read (CLAUDE.md rule 5).
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "secret.md").write_text("---\ntitle: x\ncategory: personal\n---\nSECRET\n", "utf-8")
    return tmp_path


def test_loads_each_file_once_in_name_order(data_dir: Path) -> None:
    docs = load_notes(data_dir)

    assert [doc.metadata["doc_id"] for doc in docs] == [
        "personal:about-me-personal",
        "experience:experience-notes",
    ]


def test_never_reads_data_raw(data_dir: Path) -> None:
    docs = load_notes(data_dir)

    assert all("SECRET" not in doc.page_content for doc in docs)


def test_metadata_comes_from_the_frontmatter(data_dir: Path) -> None:
    personal = load_notes(data_dir)[0]

    assert personal.metadata == {
        "doc_id": "personal:about-me-personal",
        "source_type": "personal",
        # SPEC §5.3: personal facts are retrieved by `category=personal`.
        "category": "personal",
        "title": "About Ivan — personal information",
        "url": None,
        "source_date": datetime.date(2026, 11, 1),
        "project": None,
    }


def test_source_date_is_empty_without_updated(data_dir: Path) -> None:
    experience = load_notes(data_dir)[1]

    assert experience.metadata["source_date"] is None
    assert experience.metadata["source_type"] == "experience"


def test_page_content_is_the_body_without_frontmatter(data_dir: Path) -> None:
    experience = load_notes(data_dir)[1]

    assert experience.page_content.startswith("# Experience notes — Ivan Vasiunin")
    assert "category:" not in experience.page_content


def test_unknown_category_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "x.md").write_text("---\ntitle: X\ncategory: gossip\n---\nBody\n", "utf-8")

    with pytest.raises(ValidationError):
        load_notes(tmp_path)


def test_unknown_frontmatter_key_is_rejected(tmp_path: Path) -> None:
    # A typo or an unexpected field (e.g. `phone:`) fails loudly instead of being ignored.
    text = "---\ntitle: X\ncategory: personal\nphone: '1'\n---\nBody\n"
    (tmp_path / "x.md").write_text(text, "utf-8")

    with pytest.raises(ValidationError):
        load_notes(tmp_path)
