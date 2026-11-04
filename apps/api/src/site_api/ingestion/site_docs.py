"""Load the site's own docs (SPEC, ARCHITECTURE, ADRs) so Elio can explain how the site works.

Mentor zone (ADR-0007): Ivan writes the implementation (ROADMAP 3.2).
"""

from pathlib import Path

from langchain_core.documents import Document


def load_site_docs(repo_root: Path) -> list[Document]:
    """Load SPEC.md, docs/ARCHITECTURE.md and the numbered ADRs as one document each."""
    raise NotImplementedError
