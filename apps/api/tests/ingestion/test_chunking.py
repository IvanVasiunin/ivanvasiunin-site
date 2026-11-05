"""Heading-aware chunking (ROADMAP 3.3)."""

from collections import Counter
from pathlib import Path

import pytest
from langchain_core.documents import Document

from site_api.ingestion.chunking import chunk_documents
from site_api.ingestion.sources import load_all

pytestmark = pytest.mark.mentor_pending

REPO_ROOT = Path(__file__).resolve().parents[4]
SIZE = 400
OVERLAP = 50

NOTES = """# Experience notes

Intro paragraph.

## Senior Developer — Acme

### Product
Web products.

### Key stories
Fixed a slow homepage.

## Developer — Beta

Built landing pages.
"""


def make_doc(
    text: str, doc_id: str = "experience:notes", title: str = "Experience notes"
) -> Document:
    return Document(
        page_content=text,
        metadata={
            "doc_id": doc_id,
            "source_type": "experience",
            "category": "experience",
            "title": title,
            "url": None,
            "source_date": None,
            "project": None,
        },
    )


def chunk(*docs: Document) -> list[Document]:
    return chunk_documents(list(docs), chunk_size=SIZE, chunk_overlap=OVERLAP)


def test_one_chunk_per_heading_section_in_document_order() -> None:
    chunks = chunk(make_doc(NOTES))

    assert [c.metadata["chunk_id"] for c in chunks] == [
        "experience:notes:0",
        "experience:notes:1",
        "experience:notes:2",
        "experience:notes:3",
    ]
    assert [c.metadata["section"] for c in chunks] == [
        "Experience notes",
        "Product",
        "Key stories",
        "Developer — Beta",
    ]


def test_breadcrumb_restores_the_headings_above_the_text() -> None:
    key_stories = chunk(make_doc(NOTES))[2]

    # Without the breadcrumb, "Fixed a slow homepage" would not say at which job.
    assert key_stories.page_content == (
        "Experience notes > Senior Developer — Acme > Key stories\n\nFixed a slow homepage."
    )


def test_chunks_keep_the_document_metadata() -> None:
    first = chunk(make_doc(NOTES))[0]

    assert first.metadata["doc_id"] == "experience:notes"
    assert first.metadata["source_type"] == "experience"
    assert first.metadata["category"] == "experience"
    assert first.metadata["url"] is None


def test_text_before_the_first_heading_is_a_note_in_every_chunk() -> None:
    # The CV loader puts its "written in the first person" note before the `# title`.
    doc = make_doc(
        "Written in the first person.\n\n# Acme — Dev\n\nI build UI.\n\n## Highlights\n\nFast.",
        "cv:acme",
        "Acme — Dev",
    )

    chunks = chunk(doc)

    assert [c.page_content for c in chunks] == [
        "Acme — Dev\n\nWritten in the first person.\n\nI build UI.",
        "Acme — Dev > Highlights\n\nWritten in the first person.\n\nFast.",
    ]


def test_the_note_does_not_become_a_chunk_of_its_own() -> None:
    # Regression: a long first section once left the note alone in chunk 0.
    long_body = "\n".join(f"- Achievement number {n} in this job." for n in range(40))
    doc = make_doc(f"Note.\n\n# Acme — Dev\n\n{long_body}", "cv:acme", "Acme — Dev")

    chunks = chunk(doc)

    assert len(chunks) > 1
    assert all("Achievement number" in c.page_content for c in chunks)


def test_text_without_headings_is_one_chunk_named_after_the_title() -> None:
    chunks = chunk(make_doc("Just a paragraph.", "cv:x", "Skills"))

    assert [(c.metadata["chunk_id"], c.metadata["section"]) for c in chunks] == [
        ("cv:x:0", "Skills")
    ]


def test_a_long_section_is_split_into_overlapping_pieces() -> None:
    sentences = " ".join(f"Sentence number {n} about the work." for n in range(60))
    chunks = chunk(make_doc(f"# Experience notes\n\n## Long\n\n{sentences}"))

    assert len(chunks) > 1
    assert all(c.metadata["section"] == "Long" for c in chunks)
    bodies = [c.page_content.split("\n\n", maxsplit=1)[1] for c in chunks]
    assert all(len(body) <= SIZE for body in bodies)
    # The overlap repeats the end of one piece at the start of the next.
    assert bodies[0].split()[-1] in bodies[1]


def test_a_hash_inside_a_code_block_is_not_a_heading() -> None:
    doc = make_doc("# Experience notes\n\n```sh\n# install\nuv sync\n```\n")

    chunks = chunk(doc)

    assert len(chunks) == 1
    assert "# install" in chunks[0].page_content


def test_numbering_restarts_for_every_document() -> None:
    chunks = chunk(make_doc("# A\n\nOne.", "cv:a", "A"), make_doc("# B\n\nTwo.", "cv:b", "B"))

    assert [c.metadata["chunk_id"] for c in chunks] == ["cv:a:0", "cv:b:0"]


@pytest.fixture(scope="module")
def repo_chunks() -> list[Document]:
    return chunk_documents(load_all(REPO_ROOT), chunk_size=1200, chunk_overlap=150)


def test_repo_chunk_ids_are_unique(repo_chunks: list[Document]) -> None:
    counts = Counter(c.metadata["chunk_id"] for c in repo_chunks)

    assert [chunk_id for chunk_id, count in counts.items() if count > 1] == []


def test_repo_chunks_have_text_and_a_section(repo_chunks: list[Document]) -> None:
    for c in repo_chunks:
        _, body = c.page_content.split("\n\n", maxsplit=1)
        assert body.strip(), c.metadata["chunk_id"]
        assert c.metadata["section"], c.metadata["chunk_id"]


def test_every_personal_question_is_its_own_chunk(repo_chunks: list[Document]) -> None:
    # SPEC §5.3: a personal answer must come with its question, and never with a neighbour's.
    personal = [c for c in repo_chunks if c.metadata["category"] == "personal"]

    pet = [c for c in personal if c.metadata["section"] == "Does he have a pet?"]
    assert len(pet) == 1
    assert "Does he have a pet?" in pet[0].page_content
    assert "hobbies" not in pet[0].page_content


def test_every_cv_chunk_says_it_is_written_in_the_first_person(
    repo_chunks: list[Document],
) -> None:
    cv = [c for c in repo_chunks if c.metadata["source_type"] == "cv"]

    assert cv
    for c in cv:
        assert "written by Ivan in the first person" in c.page_content, c.metadata["chunk_id"]


def test_no_trailing_spaces_in_chunk_text(repo_chunks: list[Document]) -> None:
    # The splitter joins lines with "  \n"; leftovers would change content hashes for nothing.
    for c in repo_chunks:
        assert all(line == line.rstrip() for line in c.page_content.splitlines()), c.metadata[
            "chunk_id"
        ]


def test_a_long_preamble_is_content_not_a_repeated_note() -> None:
    preamble = "Long introduction. " * 30  # ~570 characters, more than a note may be
    doc = make_doc(f"{preamble}\n\n# Experience notes\n\n## A\n\nOne.\n\n## B\n\nTwo.")

    chunks = chunk(doc)

    sections = {c.metadata["section"]: c.page_content for c in chunks}
    # The preamble forms its own chunk(s) under the title; sections A and B stay free of it.
    assert "Long introduction" in sections["Experience notes"]
    assert "Long introduction" not in sections["A"]
    assert "Long introduction" not in sections["B"]
