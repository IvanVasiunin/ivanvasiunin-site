"""Load the hand-written knowledge files in `data/*.md`.

Mentor zone (ADR-0007): Ivan writes the implementation (ROADMAP 3.2).
"""

from pathlib import Path

from langchain_core.documents import Document


def load_notes(data_dir: Path) -> list[Document]:
    """Load every `data/*.md` file (never `data/raw/`) as one document."""
    raise NotImplementedError
