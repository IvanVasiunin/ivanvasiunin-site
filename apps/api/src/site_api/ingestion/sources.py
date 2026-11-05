"""Collect every ingestion source of the knowledge base in one call.

The single list the rest of the pipeline (chunking, embedding) works on. GitHub READMEs join it
in ROADMAP 3.5.
"""

from pathlib import Path

from langchain_core.documents import Document

from site_api.ingestion.cv import load_cv
from site_api.ingestion.notes import load_notes
from site_api.ingestion.site_docs import load_site_docs


def load_all(repo_root: Path) -> list[Document]:
    """Load the CV, the data notes and the site docs from the repository at `repo_root`."""
    return [
        *load_cv(repo_root / "apps" / "web" / "src" / "content" / "cv"),
        *load_notes(repo_root / "data"),
        *load_site_docs(repo_root),
    ]
