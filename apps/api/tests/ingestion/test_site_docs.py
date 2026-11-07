"""Loading the site docs: SPEC, ARCHITECTURE and the ADRs (ROADMAP 3.2)."""

from pathlib import Path

import pytest

from site_api.ingestion.site_docs import drop_section, load_site_docs

# The real SPEC's shape around §5.6: the example table is left out of the knowledge base.
SPEC = (
    "# SPEC — site\n\nProduct spec.\n\n"
    "### 5.5 NDA\n\nOnly the role.\n\n"
    "### 5.6 Examples\n\n| Question | Answer |\n|---|---|\n"
    "| Does Ivan have a dog? | Yes, Monty |\n\n"
    "---\n\n## 6. Non-functional\n\nFast.\n"
)


@pytest.fixture
def repo_root(tmp_path: Path) -> Path:
    adr = tmp_path / "docs" / "adr"
    adr.mkdir(parents=True)
    (tmp_path / "SPEC.md").write_text(SPEC, "utf-8")
    (tmp_path / "docs" / "ARCHITECTURE.md").write_text("# Architecture\n\nBoxes.\n", "utf-8")
    (tmp_path / "docs" / "phase-0-setup.md").write_text("# Phase 0\n\nTask file.\n", "utf-8")
    (adr / "0003-vector-database.md").write_text("# ADR-0003: Vector DB\n\nPg.\n", "utf-8")
    (adr / "0001-tech-stack.md").write_text("# ADR-0001: Tech stack\n\nStack.\n", "utf-8")
    (adr / "README.md").write_text("# ADR index\n", "utf-8")
    (adr / "template.md").write_text("# ADR-NNNN: Title\n", "utf-8")
    return tmp_path


def test_loads_spec_architecture_and_numbered_adrs_only(repo_root: Path) -> None:
    docs = load_site_docs(repo_root)

    assert [doc.metadata["doc_id"] for doc in docs] == [
        "site_docs:spec",
        "site_docs:architecture",
        "site_docs:0001-tech-stack",
        "site_docs:0003-vector-database",
    ]


def test_metadata_of_an_adr(repo_root: Path) -> None:
    adr = load_site_docs(repo_root)[3]

    assert adr.metadata == {
        "doc_id": "site_docs:0003-vector-database",
        "source_type": "site_docs",
        "category": "adr",
        # The title is the document's first `# ` heading.
        "title": "ADR-0003: Vector DB",
        "url": None,
        "source_date": None,
        "project": None,
    }
    assert adr.page_content == "# ADR-0003: Vector DB\n\nPg."


def test_categories_name_the_kind_of_doc(repo_root: Path) -> None:
    categories = [doc.metadata["category"] for doc in load_site_docs(repo_root)]

    assert categories == ["spec", "architecture", "adr", "adr"]


def test_a_doc_without_a_title_is_rejected(repo_root: Path) -> None:
    (repo_root / "SPEC.md").write_text("No heading here.\n", "utf-8")

    with pytest.raises(ValueError, match=r"SPEC\.md"):
        load_site_docs(repo_root)


def test_the_spec_example_answers_are_not_knowledge(repo_root: Path) -> None:
    # SPEC §5.6 pairs example questions with expected answers; embedded, "Does Ivan have a dog?"
    # matched them word for word instead of Ivan's own notes (2026-11-07).
    spec = load_site_docs(repo_root)[0].page_content

    assert "Monty" not in spec
    assert "5.6 Examples" not in spec
    assert "Only the role." in spec
    assert "## 6. Non-functional" in spec


def test_a_renamed_example_section_is_an_error_not_a_silent_leak() -> None:
    with pytest.raises(ValueError, match="no section"):
        drop_section("# SPEC\n\n### 5.6 Sample questions\n\nQ\n", "### 5.6 Examples")


def test_a_section_ends_at_the_next_heading_of_its_level() -> None:
    text = "### A\n\none\n\n#### A.1\n\ninner\n\n### B\n\ntwo\n"

    assert drop_section(text, "### A") == "### B\n\ntwo\n"


def test_the_real_spec_still_has_the_example_section() -> None:
    # The loader leaves this heading out; if SPEC renames it, this fails before ingestion does.
    spec = Path(__file__).resolve().parents[4] / "SPEC.md"

    assert "### 5.6 Examples" in spec.read_text(encoding="utf-8").splitlines()
