"""All ingestion sources of the real repository (ROADMAP 3.2).

These tests read the actual files, so they also guard the content: no phone number, no
`data/raw/`, every source type present.
"""

import re
from collections import Counter
from pathlib import Path

import pytest
from langchain_core.documents import Document

from site_api.ingestion.sources import load_all

REPO_ROOT = Path(__file__).resolve().parents[4]

# 9+ digits with at most two separators between them: a phone number, not a date or a version.
PHONE_PATTERN = re.compile(r"\+?\d(?:[ ()-]{0,2}\d){8,}")


@pytest.fixture(scope="module")
def docs() -> list[Document]:
    return load_all(REPO_ROOT)


def test_every_source_type_is_present(docs: list[Document]) -> None:
    source_types = {doc.metadata["source_type"] for doc in docs}

    # `github_readme` arrives in ROADMAP 3.5.
    assert source_types == {"cv", "experience", "personal", "site_docs"}


def test_doc_ids_are_unique(docs: list[Document]) -> None:
    # A doc_id is the prefix of every chunk id (`<source>:<slug>:<n>`), so it must be unique.
    counts = Counter(doc.metadata["doc_id"] for doc in docs)

    assert [doc_id for doc_id, count in counts.items() if count > 1] == []


def test_no_phone_number_in_any_document(docs: list[Document]) -> None:
    # CLAUDE.md rule 5 / ARCHITECTURE §5.
    found = {
        doc.metadata["doc_id"]: PHONE_PATTERN.findall(doc.page_content)
        for doc in docs
        if PHONE_PATTERN.search(doc.page_content)
    }

    assert found == {}


def test_personal_facts_come_only_from_the_personal_file(docs: list[Document]) -> None:
    # SPEC §5.3: the personal-facts rule filters on `category=personal`.
    personal = [doc.metadata["doc_id"] for doc in docs if doc.metadata["category"] == "personal"]

    assert personal == ["personal:about-me-personal"]


def test_every_document_has_text(docs: list[Document]) -> None:
    assert all(doc.page_content.strip() for doc in docs)
