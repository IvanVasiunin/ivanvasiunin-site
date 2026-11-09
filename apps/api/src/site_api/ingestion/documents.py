"""The common shape of every loaded source: a LangChain Document with the same metadata keys.

Every loader builds its documents here, so all sources share one set of metadata keys, matching
the columns of the `chunks` table (ROADMAP 3.1). Chunking (3.3) copies them onto each chunk.
"""

import datetime
from typing import TypedDict

from langchain_core.documents import Document

from site_api.schemas.chat import SourceType


class SourceMetadata(TypedDict):
    """Metadata of one source document, before chunking."""

    doc_id: str  # `<source>:<slug>`; chunk ids add `:<n>` (SPEC §4.2)
    source_type: SourceType
    category: str
    title: str
    url: str | None
    source_date: datetime.date | None
    project: str | None


def make_document(text: str, metadata: SourceMetadata) -> Document:
    """Wrap a loaded text and its metadata in a LangChain Document."""
    # Document.metadata is a plain dict; `dict(...)` copies the TypedDict into one.
    return Document(page_content=text.strip(), metadata=dict(metadata))
