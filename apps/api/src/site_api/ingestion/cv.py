"""Load the CV content collection (`apps/web/src/content/cv`), the same files the /cv page uses.

Mentor zone (ADR-0007): Ivan writes the implementation (ROADMAP 3.2).
"""

from pathlib import Path

from langchain_core.documents import Document


def load_cv(cv_dir: Path) -> list[Document]:
    """Load every CV entry as one document with text rendered from its frontmatter and body."""
    raise NotImplementedError
