"""GitHub README ingestion from an allow-list (ROADMAP 3.5). The network is mocked."""

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from site_api.core.config import GithubReadmeSource, Settings
from site_api.ingestion.chunking import chunk_documents
from site_api.ingestion.github import (
    README_MEDIA_TYPE,
    clean_readme,
    create_github_client,
    load_github_readmes,
)
from site_api.ingestion.pii import PHONE_PLACEHOLDER, redact_phone_numbers

from .conftest import IsolatedSettings

pytestmark = pytest.mark.mentor_pending

# Built at runtime: no phone number may be written in the repo, not even a fake one (gitleaks).
FAKE_PHONE = "+NN NNN NNN NNN".replace("N", "0")

README = f"""# Tool

![screenshot](docs/screen.png)

<p align="center"><img src="logo.png" alt="logo"></p>

A web service for phone number checking. Example: {FAKE_PHONE}.

## Usage

Paste numbers and press <b>Check</b>.
"""

SOURCE = GithubReadmeSource(
    repo="IvanVasiunin/Tool", project="tool", note="README of Tool, a production project."
)


class Recorder:
    """A mock GitHub API that serves README for any repo and remembers every request."""

    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, text=README)


def client_for(recorder: Recorder, settings: Settings) -> httpx.Client:
    """The real client setup, with the transport swapped for the mock."""
    client = create_github_client(settings)
    client._transport = httpx.MockTransport(recorder)  # pyright: ignore[reportPrivateUsage] (test seam)
    return client


@pytest.fixture
def github_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"github_readmes": [SOURCE]})


def test_only_allow_listed_repositories_are_requested(github_settings: Settings) -> None:
    recorder = Recorder()

    with client_for(recorder, github_settings) as client:
        load_github_readmes(github_settings.github_readmes, client)

    assert [request.url.path for request in recorder.requests] == [
        "/repos/IvanVasiunin/Tool/readme"
    ]


def test_requests_carry_no_token_so_only_public_repos_are_served(
    github_settings: Settings,
) -> None:
    recorder = Recorder()

    with client_for(recorder, github_settings) as client:
        load_github_readmes(github_settings.github_readmes, client)

    request = recorder.requests[0]
    assert "authorization" not in request.headers
    assert request.headers["accept"] == README_MEDIA_TYPE
    assert request.headers["user-agent"] == "ivanvasiunin-site-ingestion"


def test_readme_document_metadata(github_settings: Settings) -> None:
    with client_for(Recorder(), github_settings) as client:
        (doc,) = load_github_readmes(github_settings.github_readmes, client)

    # rules/langchain-rag.md: GitHub READMEs carry type=github_readme.
    assert doc.metadata == {
        "doc_id": "github_readme:tool",
        "source_type": "github_readme",
        "category": "readme",
        "title": "Tool — GitHub README",
        "url": "https://github.com/IvanVasiunin/Tool#readme",
        "source_date": None,
        # The CV project slug: README and CV chunks of one project deduplicate together (3.6).
        "project": "tool",
    }


def test_readme_text_is_cleaned_and_redacted(github_settings: Settings) -> None:
    with client_for(Recorder(), github_settings) as client:
        (doc,) = load_github_readmes(github_settings.github_readmes, client)

    assert doc.page_content.startswith("README of Tool, a production project.")
    assert "screenshot" not in doc.page_content
    assert "<" not in doc.page_content
    assert "press Check." in doc.page_content
    assert FAKE_PHONE not in doc.page_content
    assert PHONE_PLACEHOLDER in doc.page_content


def test_every_readme_chunk_carries_the_note(github_settings: Settings) -> None:
    with client_for(Recorder(), github_settings) as client:
        docs = load_github_readmes(github_settings.github_readmes, client)

    chunks = chunk_documents(docs, chunk_size=1200, chunk_overlap=150)

    assert [c.metadata["section"] for c in chunks] == ["Tool", "Usage"]
    assert all("README of Tool, a production project." in c.page_content for c in chunks)


@pytest.mark.parametrize("status", [404, 500])
def test_a_failed_fetch_stops_ingestion(github_settings: Settings, status: int) -> None:
    # Carrying on would delete the README's stored chunks as "removed".
    with (
        client_for(Recorder(status), github_settings) as client,
        pytest.raises(ValueError, match="IvanVasiunin/Tool"),
    ):
        load_github_readmes(github_settings.github_readmes, client)


def test_a_repository_of_another_owner_is_rejected() -> None:
    other = GithubReadmeSource(repo="someone-else/tool", project="tool", note="Not Ivan's.")

    with pytest.raises(ValidationError, match="not owned by"):
        IsolatedSettings(
            database_url=SecretStr("postgresql+psycopg://site@127.0.0.1:1/site"),
            github_readmes=[other],
        )


def test_default_allow_list_is_ivans_numbers_validator(settings: Settings) -> None:
    assert [(s.repo, s.project) for s in settings.github_readmes] == [
        ("IvanVasiunin/NumbersValidator", "numbers-validator")
    ]


def test_clean_readme_keeps_text_inside_tags() -> None:
    assert (
        clean_readme('<p align="center">Hello <b>world</b></p>\n\n\n\nBye') == "Hello world\n\nBye"
    )


def test_redaction_counts_replacements() -> None:
    text, count = redact_phone_numbers(f"Call {FAKE_PHONE} or {FAKE_PHONE}.")

    assert count == 2
    assert text == f"Call {PHONE_PLACEHOLDER} or {PHONE_PLACEHOLDER}."
