"""Split loaded documents into retrieval chunks along their Markdown headings (ROADMAP 3.3).

Strategy (documented in docs/ARCHITECTURE.md §5):
1. Split each document at `#`, `##` and `###` headings, so a chunk never mixes two sections
   (two jobs, two personal questions, two ADR parts).
2. Split a section that is still longer than `chunk_size` into overlapping pieces.
3. Start every chunk with a breadcrumb line (`Doc title > Section > Subsection`). Headings are cut
   out of the text by the splitter, and a piece of "Key stories" means little without the job
   it belongs to: the breadcrumb puts that context back for the embedding, the full-text search
   and the answer model.
4. Text before the first heading is the document's context note (the CV's "written by Ivan in
   the first person"). It is repeated in every chunk of that document, right after the
   breadcrumb, so no chunk loses it.

Chunk ids are `<doc_id>:<n>` (`cv:brainrocket:0`), numbered in document order. A chunk keeps its
id while the text before it does not change; embeddings are reused by content hash anyway
(ROADMAP 3.4), so a shifted id costs no embedding call.
"""

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

# Markdown heading markers and the metadata keys the splitter stores their text under.
HEADINGS: list[tuple[str, str]] = [("#", "h1"), ("##", "h2"), ("###", "h3")]
HEADING_KEYS: tuple[str, ...] = ("h1", "h2", "h3")
BREADCRUMB_SEPARATOR = " > "
# A context note is repeated in every chunk, so it must stay short; longer text before the first
# heading is ordinary content (its own chunk). The CV note is ~60 characters.
MAX_NOTE_CHARS = 300


def chunk_documents(docs: list[Document], chunk_size: int, chunk_overlap: int) -> list[Document]:
    """Chunk every document; the result keeps the documents' order."""
    # strip_headers=True: heading lines leave the text (the breadcrumb carries them instead).
    header_splitter = MarkdownHeaderTextSplitter(HEADINGS, strip_headers=True)
    # Splits at paragraph, then line, then word boundaries, so a piece rarely ends mid-sentence.
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )
    chunks: list[Document] = []
    for doc in docs:
        chunks.extend(chunk_document(doc, header_splitter, text_splitter))
    return chunks


def chunk_document(
    doc: Document,
    header_splitter: MarkdownHeaderTextSplitter,
    text_splitter: RecursiveCharacterTextSplitter,
) -> list[Document]:
    """Chunk one document: sections first, then size-limited pieces of each section."""
    note, sections = split_context_note(header_splitter.split_text(doc.page_content))
    chunks: list[Document] = []
    for section in sections:
        headings = section_headings(section)
        for piece in text_splitter.split_text(section.page_content):
            chunks.append(make_chunk(doc, len(chunks), headings, note, piece))
    return chunks


def split_context_note(sections: list[Document]) -> tuple[str, list[Document]]:
    """Separate the text before the first heading (the context note) from the sections.

    The header splitter returns that text as a first section without headings. A document with
    no headings at all has only that section: then it is the content, not a note. Neither is a
    long preamble, which would bloat every chunk.
    """
    if len(sections) <= 1 or sections[0].metadata:
        return "", sections
    if len(sections[0].page_content) > MAX_NOTE_CHARS:
        return "", sections
    return sections[0].page_content.strip(), sections[1:]


def section_headings(section: Document) -> list[str]:
    """The headings above a section, outermost first (`["Title", "Job", "Key stories"]`)."""
    return [str(section.metadata[key]) for key in HEADING_KEYS if key in section.metadata]


def make_chunk(doc: Document, index: int, headings: list[str], note: str, piece: str) -> Document:
    """Build one chunk: breadcrumb, context note and text, plus metadata, id and section."""
    title = str(doc.metadata["title"])
    # The title usually is the `#` heading too; it appears in the breadcrumb once.
    crumbs = [title, *(heading for heading in headings if heading != title)]
    metadata = {
        **doc.metadata,
        "chunk_id": f"{doc.metadata['doc_id']}:{index}",
        # The innermost heading names the chunk on the map and in "Under the hood".
        "section": crumbs[-1],
    }
    parts = [BREADCRUMB_SEPARATOR.join(crumbs), note, clean(piece)]
    content = "\n\n".join(part for part in parts if part)
    return Document(page_content=content, metadata=metadata)


def clean(text: str) -> str:
    """Drop the trailing spaces the header splitter leaves at the end of joined lines."""
    return "\n".join(line.rstrip() for line in text.strip().splitlines())
