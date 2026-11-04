"""Collect every ingestion source of the knowledge base in one call.

Mentor zone (ADR-0007): Ivan writes the implementation (ROADMAP 3.2).
"""

from pathlib import Path

from langchain_core.documents import Document


def load_all(repo_root: Path) -> list[Document]:
    """Load the CV, the data notes and the site docs from the repository at `repo_root`."""
    raise NotImplementedError
