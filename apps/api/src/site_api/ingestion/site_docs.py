"""Load the site's own docs (SPEC, ARCHITECTURE, ADRs) so Elio can explain how the site works.

These files have no frontmatter: the title is the first `# ` heading, and the category says
which kind of doc it is.
"""

from pathlib import Path

from langchain_core.documents import Document

from site_api.ingestion.documents import SourceMetadata, make_document


def load_site_docs(repo_root: Path) -> list[Document]:
    """Load SPEC.md, docs/ARCHITECTURE.md and the numbered ADRs as one document each."""
    docs_dir = repo_root / "docs"
    sources = [(repo_root / "SPEC.md", "spec"), (docs_dir / "ARCHITECTURE.md", "architecture")]
    # `[0-9]*` keeps the numbered ADRs: the index (README.md) and template.md are skipped.
    for path in sorted((docs_dir / "adr").glob("[0-9]*.md")):
        sources.append((path, "adr"))
    return [load_site_doc(path, category) for path, category in sources]


def load_site_doc(path: Path, category: str) -> Document:
    """Load one doc; its first `# ` heading is the title."""
    text = path.read_text(encoding="utf-8")
    metadata: SourceMetadata = {
        "doc_id": f"site_docs:{path.stem.lower()}",
        "source_type": "site_docs",
        "category": category,
        "title": first_heading(text, path),
        "url": None,
        "source_date": None,
        "project": None,
    }
    return make_document(text, metadata)


def first_heading(text: str, path: Path) -> str:
    """Return the text of the first level-1 heading, e.g. `ADR-0003: Vector DB`."""
    for line in text.splitlines():
        if line.startswith("# "):
            return line.removeprefix("# ").strip()
    raise ValueError(f"{path.name}: no '# ' title heading")
