"""Apply the database migrations: `python -m site_api.db.migrate` (ADR-0003, docs/RUNBOOK.md).

The migrations live inside the package (`site_api/db/migrations`), so they ship in the API image
with the code that needs them. This entry point builds the Alembic configuration in code, so it
needs no `alembic.ini` or `pyproject.toml` next to it: the deploy runs it in a one-off API container
(`infra/deploy.sh`) before the new release starts. In development the `alembic` CLI also works from
`apps/api` (`[tool.alembic]` in pyproject.toml points at the same scripts).
"""

from alembic import command
from alembic.config import Config

SCRIPT_LOCATION = "site_api.db:migrations"


def alembic_config(url: str | None = None) -> Config:
    """The Alembic configuration for this package's migrations.

    Args:
        url: A database URL to use instead of the settings' `DATABASE_URL` (tests, offline SQL).
    """
    config = Config()
    config.set_main_option("script_location", SCRIPT_LOCATION)
    if url is not None:
        # ConfigParser interpolation: a literal `%` (URL-encoded password) must be doubled.
        config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def main() -> None:
    """Upgrade the configured database to the latest revision."""
    command.upgrade(alembic_config(), "head")
    # Alembic's own logging is not configured here, so the deploy log gets one plain line (no URL).
    print("migrate: database is at the latest revision")


if __name__ == "__main__":
    main()
