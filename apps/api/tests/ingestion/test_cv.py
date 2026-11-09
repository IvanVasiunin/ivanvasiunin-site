"""Loading the CV content collection (ROADMAP 3.2)."""

import datetime
from pathlib import Path

import pytest
from langchain_core.documents import Document
from pydantic import ValidationError

from site_api.ingestion.cv import load_cv

PROFILE = """---
section: profile
name: Ivan Vasiunin
headline: Frontend Developer
location: Valencia, Spain
brief:
  - Frontend developer.
contacts:
  email: ivan@example.com
  telegram: '@IvanVasiunin'
  github: https://github.com/IvanVasiunin
  linkedin: https://www.linkedin.com/in/ivan
---

I'm a frontend developer with nearly 10 years of experience.
"""

JOB = """---
section: job
company: Acme
title: Senior Developer
employment: full-time
start: 2024-11
end: present
location: Valencia, Spain
stack: [HTML, SCSS]
brief:
  - I build UI.
order: 1
---

Large web products.

**Highlights**

- **Performance.** Fixed a slow homepage.
"""

PROJECT = """---
section: project
name: 'Little Lemon'
kind: study
date: '2024-03'
stack: [React, Jest]
brief:
  - Restaurant website with a table-booking form.
repo: https://github.com/IvanVasiunin/little-lemon
order: 2
---
"""

SKILLS = """---
section: skills
groups:
  - name: Frontend & web
    items: [HTML5, CSS3]
  - name: AI tools
    items: [Claude Code]
---
"""

EDUCATION = """---
section: education
entries:
  - institution: Donetsk National Technical University
    degree: Bachelor's degree
    field: Telecommunications
    start: 2010
    end: 2014
  - institution: IT STEP Computer Academy
    degree: Full-stack developer program
    start: 2018
    end: 2019
---
"""

CERTIFICATIONS = """---
section: certifications
entries:
  - name: The AI Engineer Course
    issuer: Udemy
    date: '2026'
    url: https://example.com/cert
---
"""

LANGUAGES = """---
section: languages
entries:
  - name: Ukrainian
    level: native
  - name: English
    level: professional working
---
"""


@pytest.fixture
def cv_dir(tmp_path: Path) -> Path:
    (tmp_path / "jobs").mkdir()
    (tmp_path / "projects").mkdir()
    files = {
        "profile.md": PROFILE,
        "jobs/acme.md": JOB,
        "projects/little-lemon.md": PROJECT,
        "skills.md": SKILLS,
        "education.md": EDUCATION,
        "certifications.md": CERTIFICATIONS,
        "languages.md": LANGUAGES,
    }
    for name, text in files.items():
        (tmp_path / name).write_text(text, encoding="utf-8")
    return tmp_path


def doc_by_id(cv_dir: Path, doc_id: str) -> Document:
    """The loaded document with this doc_id."""
    return next(doc for doc in load_cv(cv_dir) if doc.metadata["doc_id"] == doc_id)


def texts_by_id(cv_dir: Path) -> dict[str, str]:
    """Map doc_id → page_content, for content assertions."""
    return {doc.metadata["doc_id"]: doc.page_content for doc in load_cv(cv_dir)}


def test_loads_every_entry_including_subfolders(cv_dir: Path) -> None:
    ids = sorted(doc.metadata["doc_id"] for doc in load_cv(cv_dir))

    assert ids == [
        "cv:acme",
        "cv:certifications",
        "cv:education",
        "cv:languages",
        "cv:little-lemon",
        "cv:profile",
        "cv:skills",
    ]


def test_job_metadata(cv_dir: Path) -> None:
    job = doc_by_id(cv_dir, "cv:acme")

    assert job.metadata == {
        "doc_id": "cv:acme",
        "source_type": "cv",
        "category": "job",
        "title": "Acme — Senior Developer",
        # The heading id of the job on the /cv page (CvJob.astro).
        "url": "/cv#job-acme",
        # A `YYYY-MM` month becomes the first day of that month.
        "source_date": datetime.date(2024, 11, 1),
        "project": None,
    }


def test_job_text_has_the_facts_and_the_full_body(cv_dir: Path) -> None:
    text = texts_by_id(cv_dir)["cv:acme"]

    assert "# Acme — Senior Developer" in text
    assert "Full-time, 2024-11 to present, Valencia, Spain." in text
    assert "Stack: HTML, SCSS." in text
    assert "**Performance.** Fixed a slow homepage." in text


def test_project_metadata_groups_chunks_by_project(cv_dir: Path) -> None:
    project = doc_by_id(cv_dir, "cv:little-lemon")

    assert project.metadata["category"] == "project"
    assert project.metadata["url"] == "/cv#project-little-lemon"
    assert project.metadata["source_date"] == datetime.date(2024, 3, 1)
    # Retrieval deduplicates chunks per project (ROADMAP 3.6).
    assert project.metadata["project"] == "little-lemon"


def test_project_text_says_it_is_a_study_project(cv_dir: Path) -> None:
    # SPEC §5.2: study projects are always described as study projects.
    text = texts_by_id(cv_dir)["cv:little-lemon"]

    assert "Study project, 2024-03." in text
    assert "- Restaurant website with a table-booking form." in text
    assert "Repository: https://github.com/IvanVasiunin/little-lemon" in text


def test_every_cv_text_says_it_is_ivans_cv_in_the_first_person(cv_dir: Path) -> None:
    # The CV is written as "I …"; Elio speaks about Ivan in the third person (SPEC §5.2).
    for text in texts_by_id(cv_dir).values():
        assert text.startswith("From Ivan Vasiunin's CV, written by Ivan in the first person.")


def test_profile_text_has_no_contacts(cv_dir: Path) -> None:
    # Contacts come from config in the templates; the email does not need to be retrieved.
    text = texts_by_id(cv_dir)["cv:profile"]

    assert "# Ivan Vasiunin — Frontend Developer" in text
    assert "I'm a frontend developer" in text
    assert "ivan@example.com" not in text


def test_list_sections_render_one_line_per_entry(cv_dir: Path) -> None:
    texts = texts_by_id(cv_dir)

    assert "- Frontend & web: HTML5, CSS3" in texts["cv:skills"]
    assert (
        "- Bachelor's degree, Telecommunications — Donetsk National Technical University, "
        "2010 to 2014" in texts["cv:education"]
    )
    assert (
        "- Full-stack developer program — IT STEP Computer Academy, 2018 to 2019"
        in texts["cv:education"]
    )
    assert "- The AI Engineer Course — Udemy, 2026" in texts["cv:certifications"]
    assert "- English: professional working" in texts["cv:languages"]


def test_section_urls_point_at_the_cv_page(cv_dir: Path) -> None:
    urls = {doc.metadata["doc_id"]: doc.metadata["url"] for doc in load_cv(cv_dir)}

    assert urls["cv:profile"] == "/cv#summary"
    assert urls["cv:skills"] == "/cv#skills"
    assert urls["cv:education"] == "/cv#education"


def test_unknown_frontmatter_key_is_rejected(cv_dir: Path) -> None:
    # Mirrors the strict Zod schema of the collection: no unexpected fields (e.g. `phone`).
    text = SKILLS.replace("section: skills", "section: skills\nphone: '1'")
    (cv_dir / "skills.md").write_text(text, encoding="utf-8")

    with pytest.raises(ValidationError):
        load_cv(cv_dir)


def test_job_without_body_falls_back_to_its_brief(cv_dir: Path) -> None:
    # The schema allows an empty body; the Brief bullets must not be lost then.
    head = JOB.split("\n---\n", maxsplit=1)[0]
    (cv_dir / "jobs" / "acme.md").write_text(f"{head}\n---\n", encoding="utf-8")

    assert "- I build UI." in texts_by_id(cv_dir)["cv:acme"]


def test_validation_error_names_the_file(cv_dir: Path) -> None:
    text = SKILLS.replace("section: skills", "section: skills\nphone: '1'")
    (cv_dir / "skills.md").write_text(text, encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_cv(cv_dir)

    assert any("skills.md" in note for note in error.value.__notes__)
