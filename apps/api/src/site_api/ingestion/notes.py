"""Load the hand-written knowledge files in `data/*.md`.

`experience-notes.md` and `about-me-personal.md` hold what the CV is too short for. Their
`category` sets the source type, and `category=personal` is what the personal-facts rule
filters on (SPEC §5.3).
"""

import datetime
from pathlib import Path
from typing import Literal

from langchain_core.documents import Document
from pydantic import BaseModel, ConfigDict

from site_api.ingestion.documents import SourceMetadata, make_document
from site_api.ingestion.frontmatter import split_frontmatter


class NoteFrontmatter(BaseModel):
    """The frontmatter of a `data/*.md` file."""

    # extra="forbid": an unknown key (a typo, or `phone:`) fails instead of being ignored.
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str
    category: Literal["experience", "personal"]
    source: str
    updated: datetime.date | None = None


def load_notes(data_dir: Path) -> list[Document]:
    """Load every `data/*.md` file (never `data/raw/`) as one document."""
    # `glob("*.md")` does not descend into folders, so `data/raw/` is never visited.
    # sorted(): the same order on every run and every OS.
    return [load_note(path) for path in sorted(data_dir.glob("*.md"))]


def load_note(path: Path) -> Document:
    """Load one notes file: validate its frontmatter and keep its body as the text."""
    meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
    front = NoteFrontmatter.model_validate(meta)
    metadata: SourceMetadata = {
        "doc_id": f"{front.category}:{path.stem}",
        "source_type": front.category,
        "category": front.category,
        "title": front.title,
        "url": None,
        "source_date": front.updated,
        "project": None,
    }
    return make_document(body, metadata)
