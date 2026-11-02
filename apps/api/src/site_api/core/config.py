"""Application settings, read once from the environment and `.env`.

Every tunable value (versions, timeouts, origins, model IDs later on) lives here, so code never
reads `os.environ` directly (ruff TID251) and tests can build a `Settings` object with exactly the
values they need.
"""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def is_production(self) -> bool:
        """Whether this is the deployed site (it hides the API docs and schema, for one)."""
        return self.app_env == "production"
