"""Application settings, read once from the environment and `.env`.

Every tunable value (versions, timeouts, origins, model IDs later on) lives here, so code never
reads `os.environ` directly (ruff TID251) and tests can build a `Settings` object with exactly the
values they need.
"""

from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# A GitHub `owner/name`, the form the README API takes.
GITHUB_REPO_PATTERN = r"^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$"


class GithubReadmeSource(BaseModel):
    """One allow-listed public repository whose README joins the knowledge base (ROADMAP 3.5)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    repo: str = Field(pattern=GITHUB_REPO_PATTERN)
    # The CV project slug (`projects/<slug>.md`), so retrieval deduplicates README chunks and CV
    # chunks of one project together (ROADMAP 3.6).
    project: str = Field(pattern=r"^[a-z0-9-]+$")
    # Repeated in every chunk of the README: what the repository is, so the answer model can
    # label it (SPEC §5.2: study projects are described as study projects). Short on purpose.
    note: str = Field(min_length=1, max_length=300)


def find_env_file(start: Path) -> Path | None:
    """Find the repository's `.env` by walking up from `start` to the folder with `.env.example`.

    Searching for a marker file instead of counting parent folders keeps working wherever the
    package lives. In Docker (ROADMAP 1.6) there is no repository around the installed package, so
    this returns `None` and the values come from the container environment only.
    """
    for folder in start.resolve().parents:
        if (folder / ".env.example").is_file():
            return folder / ".env"
    return None


class Settings(BaseSettings):
    """Typed settings for the API.

    Values come from environment variables (case-insensitive) or the repository's `.env` file.
    Secrets are `SecretStr`, so they never appear in reprs, logs or tracebacks.
    """

    model_config = SettingsConfigDict(
        env_file=find_env_file(Path(__file__)),
        env_file_encoding="utf-8",
        # `.env` also holds values for other tools (Langfuse, Context7); ignore what we do not use.
        extra="ignore",
    )

    # Fail closed: without an explicit APP_ENV the app behaves as production (no interactive
    # docs). Local development sets APP_ENV=development in `.env`.
    app_env: Literal["development", "test", "production"] = "production"
    # The deployed git SHA, set when the image is built (ROADMAP 1.6); `dev` for local runs.
    app_version: str = "dev"

    # Required: there is no safe default for a database URL. Format: `postgresql+psycopg://…`.
    database_url: SecretStr
    # Connection pool for the whole app. Small on purpose: one small VPS, one API process.
    db_pool_size: int = Field(default=5, ge=1, le=20)
    db_max_overflow: int = Field(default=5, ge=0, le=20)
    # How long a request waits for a free pooled connection, and for a new connection to open.
    db_pool_timeout_s: float = Field(default=5.0, gt=0, le=30)
    db_connect_timeout_s: int = Field(default=3, ge=1, le=30)

    # How long `GET /api/health` waits for the database before it reports `db: down`.
    db_health_timeout_s: float = Field(default=2.0, gt=0, le=10)
    # How long one health result is reused: a flood of health checks costs one query per window.
    health_cache_ttl_s: float = Field(default=5.0, ge=0, le=60)

    # Browser origins allowed to call the API (exact, e.g. `["https://ivanvasiunin.com"]`). In
    # development, any `http://localhost:<port>` is allowed on top (the Astro dev server).
    cors_allow_origins: list[str] = Field(default_factory=list)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # OpenAI key for embeddings (ingestion now, the query embedding later). Optional, so the API
    # and the ingestion estimate run without it; `ingestion --apply` fails clearly when it is unset.
    openai_api_key: SecretStr | None = None
    # ADR-0001: text-embedding-3-large shortened to 1536 dimensions, the `vector(1536)` column of
    # migration 0001. Changing either needs a migration and a full reindex.
    embedding_model: str = "text-embedding-3-large"
    embedding_dimensions: int = Field(default=1536, ge=1, le=3072)
    # USD per 1M input tokens, for the cost estimate printed before any paid embedding run.
    embedding_price_per_1m_tokens: float = Field(default=0.13, ge=0)

    # Chunking (ROADMAP 3.3, docs/ARCHITECTURE.md §5): the maximum body size of one chunk in
    # characters, and how many characters neighbouring pieces of one long section share.
    chunk_size: int = Field(default=1200, ge=200, le=8000)
    chunk_overlap: int = Field(default=150, ge=0, le=1000)

    # GitHub READMEs (ROADMAP 3.5). Only these repositories are fetched, only from this owner,
    # without a token: the API then serves public repositories only. Proposed default: the one
    # CV project whose README describes the project (the Little Lemon repository still has the
    # Create React App boilerplate README). Override with GITHUB_READMES='[{...}]' (JSON).
    github_owner: str = "IvanVasiunin"
    github_readmes: list[GithubReadmeSource] = Field(
        default_factory=lambda: [
            GithubReadmeSource(
                repo="IvanVasiunin/NumbersValidator",
                project="numbers-validator",
                note=(
                    "README of NumbersValidator, a production web tool Ivan built at "
                    "Liketelecom, from his public GitHub repository."
                ),
            ),
        ]
    )
    github_api_url: str = "https://api.github.com"
    github_timeout_s: float = Field(default=10.0, gt=0, le=60)

    # Hybrid retrieval (ROADMAP 3.6, ADR-0003). Each search (vector, full-text) returns this many
    # candidates; RRF fuses them; at most `retrieval_max_per_project` chunks of one project are
    # kept, and the best `retrieval_top_k` go to the answer model. Starting values, tuned by evals.
    retrieval_candidates: int = Field(default=20, ge=1, le=200)
    retrieval_top_k: int = Field(default=6, ge=1, le=50)
    retrieval_max_per_project: int = Field(default=2, ge=1, le=50)
    # The RRF constant: 60 is the value of the original paper (Cormack et al., 2009); a larger k
    # flattens the difference between ranks.
    retrieval_rrf_k: int = Field(default=60, ge=1, le=1000)

    @field_validator("cors_allow_origins")
    @classmethod
    def _explicit_origins_only(cls, origins: list[str]) -> list[str]:
        """Accept only exact origins: `https://host[:port]`, no `*`, path, slash or `null`.

        Browsers send the origin in exactly this form and the CORS check compares strings, so
        `https://ivanvasiunin.com/` (with a slash) would silently never match. `*` would let any
        site call the API (fastapi.md, Security); `null` would allow sandboxed pages and files.
        """
        for origin in origins:
            if "*" in origin:
                msg = "CORS origins must be explicit; '*' is not allowed"
                raise ValueError(msg)
            parts = urlsplit(origin)
            if (
                parts.scheme not in {"http", "https"}
                or not parts.netloc
                or parts.path
                or parts.query
                or parts.fragment
            ):
                msg = f"CORS origin must look like https://example.com[:port], got {origin!r}"
                raise ValueError(msg)
        return origins

    @model_validator(mode="after")
    def _readmes_from_the_owner_only(self) -> Self:
        """Every allow-listed README must belong to `github_owner` (rules/langchain-rag.md).

        A typo or a pasted third-party repository would otherwise put someone else's text into
        what Elio says about Ivan.
        """
        for source in self.github_readmes:
            owner = source.repo.split("/", 1)[0]
            if owner.lower() != self.github_owner.lower():
                msg = f"README {source.repo!r} is not owned by {self.github_owner!r}"
                raise ValueError(msg)
        return self

    @property
    def is_production(self) -> bool:
        """Whether this is the deployed site (it hides the API docs and schema, for one)."""
        return self.app_env == "production"
