"""Fetch the READMEs of allow-listed public GitHub repositories (ROADMAP 3.5).

Only the repositories in `Settings.github_readmes` are fetched (an allow-list, validated to belong
to `github_owner`), and no token is sent, so the GitHub API serves public repositories only.
A failed fetch stops ingestion: carrying on would delete that README's chunks as "removed".
"""

import re

import httpx
from langchain_core.documents import Document

from site_api.core.config import GithubReadmeSource, Settings
from site_api.ingestion.documents import SourceMetadata, make_document
from site_api.ingestion.pii import redact_phone_numbers

# Asks the README endpoint for the raw Markdown instead of a JSON envelope with base64 content.
README_MEDIA_TYPE = "application/vnd.github.raw+json"
# GitHub rejects requests without a User-Agent. A generic client name, no personal data.
USER_AGENT = "ivanvasiunin-site-ingestion"

# Markup that carries no meaning for retrieval: images (Markdown and HTML) and other HTML tags.
_MARKDOWN_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_HTML_TAG = re.compile(r"<[^>]+>")
_EXTRA_BLANK_LINES = re.compile(r"\n{3,}")


def create_github_client(settings: Settings) -> httpx.Client:
    """An HTTP client for the GitHub API with a timeout and the raw README media type."""
    return httpx.Client(
        base_url=settings.github_api_url,
        timeout=settings.github_timeout_s,
        headers={"Accept": README_MEDIA_TYPE, "User-Agent": USER_AGENT},
    )


def load_github_readmes(sources: list[GithubReadmeSource], client: httpx.Client) -> list[Document]:
    """Fetch every allow-listed README as one document, in allow-list order."""
    return [load_github_readme(source, client) for source in sources]


def load_github_readme(source: GithubReadmeSource, client: httpx.Client) -> Document:
    """Fetch, clean and redact one README.

    Raises:
        ValueError: the README could not be fetched (network error or a non-2xx status).
    """
    try:
        response = client.get(f"/repos/{source.repo}/readme")
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise ValueError(f"README of {source.repo} could not be fetched: {error}") from error
    text, _ = redact_phone_numbers(clean_readme(response.text))
    name = source.repo.split("/", 1)[1]
    metadata: SourceMetadata = {
        "doc_id": f"github_readme:{source.project}",
        "source_type": "github_readme",
        "category": "readme",
        "title": f"{name} — GitHub README",
        "url": f"https://github.com/{source.repo}#readme",
        "source_date": None,
        "project": source.project,
    }
    # The note comes before the first heading, so chunking repeats it in every chunk.
    return make_document(f"{source.note}\n\n{text}", metadata)


def clean_readme(markdown: str) -> str:
    """Drop images and HTML tags (keeping the text inside tags) and extra blank lines."""
    text = _MARKDOWN_IMAGE.sub("", markdown)
    text = _HTML_TAG.sub("", text)
    return _EXTRA_BLANK_LINES.sub("\n\n", text).strip()
