"""Load the CV content collection (`apps/web/src/content/cv`), the same files the /cv page uses.

Each file is one CV entry. Its frontmatter is structured data (dates, stack, lists), so it is
rendered to Markdown text here; chunking (3.3) then splits that text by headings.
"""

import datetime
from collections.abc import Iterable
from pathlib import Path

from langchain_core.documents import Document
from pydantic import TypeAdapter, ValidationError

from site_api.ingestion.cv_models import (
    Certifications,
    CvEntry,
    Education,
    EducationEntry,
    Job,
    Languages,
    Profile,
    Project,
    Skills,
)
from site_api.ingestion.documents import SourceMetadata, make_document
from site_api.ingestion.frontmatter import split_frontmatter

# The CV says "I build…". This line tells the answer model whose "I" it is, so Elio can retell
# it in the third person (SPEC §5.2).
CV_INTRO = "From Ivan Vasiunin's CV, written by Ivan in the first person."

# SPEC §5.2: study projects are always described as study projects.
KIND_LABELS: dict[str, str] = {
    "production": "Production project",
    "personal": "Personal project",
    "study": "Study project",
    "test-task": "Test task for a job application",
}

# Titles of the sections that are one list each; they match the /cv headings.
SECTION_TITLES: dict[str, str] = {
    "skills": "Skills",
    "education": "Education",
    "certifications": "Certifications and courses",
    "languages": "Languages",
}

# A TypeAdapter validates types that are not a BaseModel, here the tagged union. Built once.
_CV_ENTRY: TypeAdapter[CvEntry] = TypeAdapter(CvEntry)


def load_cv(cv_dir: Path) -> list[Document]:
    """Load every CV entry as one document with text rendered from its frontmatter and body."""
    # rglob: jobs/ and projects/ are subfolders.
    return [load_cv_entry(path) for path in sorted(cv_dir.rglob("*.md"))]


def load_cv_entry(path: Path) -> Document:
    """Validate one CV file and turn it into a document."""
    meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
    try:
        entry = _CV_ENTRY.validate_python(meta)
    except ValidationError as error:
        # The Pydantic message names the field, not the file; the note adds which file it was.
        error.add_note(f"CV file: {path}")
        raise
    slug = path.stem
    title, blocks = render_entry(entry, body)
    text = "\n\n".join(block for block in [CV_INTRO, f"# {title}", *blocks] if block)
    metadata: SourceMetadata = {
        "doc_id": f"cv:{slug}",
        "source_type": "cv",
        "category": entry.section,
        "title": title,
        "url": entry_url(entry, slug),
        "source_date": entry_date(entry),
        "project": slug if isinstance(entry, Project) else None,
    }
    return make_document(text, metadata)


def render_entry(entry: CvEntry, body: str) -> tuple[str, list[str]]:
    """Return the title and the text blocks of one CV entry.

    The body is the Full view. Where it is empty (the schema allows that), the Brief bullets
    from the frontmatter stand in, so no entry is left without its content.
    """
    match entry:
        case Profile():
            summary = body or bullets(entry.brief)
            return f"{entry.name} — {entry.headline}", [f"Location: {entry.location}.", summary]
        case Job():
            details = body or bullets(entry.brief)
            return f"{entry.company} — {entry.title}", [job_facts(entry), details]
        case Project():
            return entry.name, [project_facts(entry), bullets(entry.brief)]
        case _:
            # pyright narrows `entry` here to the four list sections.
            return SECTION_TITLES[entry.section], [bullets(list_lines(entry))]


def list_lines(entry: Skills | Education | Certifications | Languages) -> list[str]:
    """One line per item of a list section."""
    match entry:
        case Skills():
            return [f"{group.name}: {', '.join(group.items)}" for group in entry.groups]
        case Education():
            return [education_line(item) for item in entry.entries]
        case Certifications():
            return [f"{cert.name} — {cert.issuer}, {cert.date}" for cert in entry.entries]
        case Languages():
            return [f"{lang.name}: {lang.level}" for lang in entry.entries]


def job_facts(job: Job) -> str:
    """`Full-time, 2024-11 to present, Valencia, Spain.` and the stack line."""
    parts = [job.employment.capitalize(), f"{job.start} to {job.end}"]
    if job.location:
        parts.append(job.location)
    facts = ", ".join(parts) + "."
    if job.stack:
        facts += f"\nStack: {', '.join(job.stack)}."
    return facts


def project_facts(project: Project) -> str:
    """`Study project, 2024-03.`, the stack and the links."""
    kind = KIND_LABELS[project.kind]
    lines = [f"{kind}, {project.date}." if project.date else f"{kind}."]
    lines.append(f"Stack: {', '.join(project.stack)}.")
    if project.repo:
        lines.append(f"Repository: {project.repo}")
    if project.demo:
        lines.append(f"Demo: {project.demo}")
    return "\n".join(lines)


def education_line(item: EducationEntry) -> str:
    """`Bachelor's degree, Telecommunications — University, 2010 to 2014`."""
    degree = f"{item.degree}, {item.field}" if item.field else item.degree
    return f"{degree} — {item.institution}, {item.start} to {item.end}"


def bullets(items: Iterable[str]) -> str:
    """A Markdown bullet list, one item per line."""
    return "\n".join(f"- {item}" for item in items)


def entry_url(entry: CvEntry, slug: str) -> str:
    """The anchor of the entry on /cv (heading ids from CvJob, CvProject and cv.astro)."""
    match entry:
        case Job():
            return f"/cv#job-{slug}"
        case Project():
            return f"/cv#project-{slug}"
        case Profile():
            return "/cv#summary"
        case _:
            return f"/cv#{entry.section}"


def entry_date(entry: CvEntry) -> datetime.date | None:
    """When the entry happened: a job's start, a project's date; none for the other sections."""
    if isinstance(entry, Job):
        return month_to_date(entry.start)
    if isinstance(entry, Project) and entry.date:
        return month_to_date(entry.date)
    return None


def month_to_date(value: str) -> datetime.date:
    """`2024-11` → 2024-11-01; a bare year `2026` → 2026-01-01."""
    year, _, month = value.partition("-")
    return datetime.date(int(year), int(month or "1"), 1)
