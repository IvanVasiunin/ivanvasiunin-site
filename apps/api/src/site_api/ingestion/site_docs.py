"""Load the site's own docs (SPEC, ARCHITECTURE, ADRs) so Elio can explain how the site works.

These files have no frontmatter: the title is the first `# ` heading, and the category says
which kind of doc it is.
"""

from pathlib import Path

from langchain_core.documents import Document

from site_api.ingestion.documents import SourceMetadata, make_document

# Sections that are not knowledge: SPEC §5.6 lists example questions with their expected answers
# ("Does Ivan have a dog?" → "Yes, Monty…"). Embedded, they match personal questions word for
# word and compete with Ivan's own notes, the only source of personal facts (SPEC §5.3).
EXCLUDED_SECTIONS: dict[str, tuple[str, ...]] = {"spec": ("### 5.6 Examples",)}


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
    title = first_heading(text, path)
    for heading in EXCLUDED_SECTIONS.get(path.stem.lower(), ()):
        try:
            text = drop_section(text, heading)
        except ValueError as error:
            raise ValueError(f"{path.name}: {error}") from error
    metadata: SourceMetadata = {
        "doc_id": f"site_docs:{path.stem.lower()}",
        "source_type": "site_docs",
        "category": category,
        "title": title,
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


def drop_section(text: str, heading: str) -> str:
    """The text without the section that starts with this heading line.

    The section ends at the next heading of the same or a higher level, or at a `---` rule.

    Raises:
        ValueError: the heading is not in the text (a renamed section would otherwise slip back in).
    """
    lines = text.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.rstrip() == heading]
    if not starts:
        raise ValueError(f"no section {heading!r} to leave out")
    start = starts[0]
    level = len(heading) - len(heading.lstrip("#"))
    end = start + 1
    while end < len(lines):
        line = lines[end]
        hashes = len(line) - len(line.lstrip("#"))
        if line.rstrip() == "---" or (0 < hashes <= level and line[hashes : hashes + 1] == " "):
            break
        end += 1
    return "".join(lines[:start] + lines[end:])
