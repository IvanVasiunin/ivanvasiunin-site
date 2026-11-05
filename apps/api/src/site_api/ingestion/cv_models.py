"""Pydantic models of the CV frontmatter, mirroring the Zod schema of the web app.

`apps/web/src/lib/cv/schema.ts` is the source of truth and the gatekeeper: the web build fails on
bad dates, URLs or list sizes, so these models check only the shape ingestion relies on (keys
and types). They forbid unknown keys the same way, so a new CV field fails ingestion until
someone decides whether Elio should know it.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    """Base model: unknown keys fail, instances are read-only."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Profile(Strict):
    """`profile.md`: name, headline and the summary in the body."""

    section: Literal["profile"]
    name: str
    headline: str
    location: str
    brief: list[str]
    contacts: dict[str, str]  # not rendered: the templates take contacts from config


class Job(Strict):
    """`jobs/*.md`: one job; the body is the Full view."""

    section: Literal["job"]
    company: str
    title: str
    employment: Literal["full-time", "part-time"]
    start: str  # `YYYY-MM`
    end: str  # `YYYY-MM` or `present`
    location: str | None = None
    # A list default is safe in Pydantic: each instance gets its own copy (unlike a plain class).
    stack: list[str] = []
    brief: list[str]
    order: int


class Project(Strict):
    """`projects/*.md`: one project; frontmatter only."""

    section: Literal["project"]
    name: str
    kind: Literal["production", "personal", "study", "test-task"]
    date: str | None = None  # `YYYY-MM`
    stack: list[str]
    brief: list[str]
    repo: str | None = None
    demo: str | None = None
    order: int


class SkillGroup(Strict):
    """One named group of skills."""

    name: str
    items: list[str]


class Skills(Strict):
    """`skills.md`."""

    section: Literal["skills"]
    groups: list[SkillGroup]


class EducationEntry(Strict):
    """One degree or program."""

    institution: str
    degree: str
    field: str | None = None
    start: int
    end: int


class Education(Strict):
    """`education.md`."""

    section: Literal["education"]
    entries: list[EducationEntry]


class Certification(Strict):
    """One certificate or course."""

    name: str
    issuer: str
    date: str  # `YYYY` or `YYYY-MM`
    url: str | None = None  # not rendered on purpose: a certificate link adds nothing to answers


class Certifications(Strict):
    """`certifications.md`."""

    section: Literal["certifications"]
    entries: list[Certification]


class Language(Strict):
    """One spoken language and its level."""

    name: str
    level: str


class Languages(Strict):
    """`languages.md`."""

    section: Literal["languages"]
    entries: list[Language]


# A tagged union: Pydantic reads `section` first and validates against that one model only, so
# an error names the right model instead of listing all seven. `type X = …` is the Python 3.12+
# way to name a type alias; `Annotated` attaches the discriminator to the union.
type CvEntry = Annotated[
    Profile | Job | Project | Skills | Education | Certifications | Languages,
    Field(discriminator="section"),
]
