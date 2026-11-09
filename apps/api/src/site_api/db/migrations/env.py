"""Alembic environment for the site's database (ADR-0003: Alembic owns every table).

The database URL comes from the application settings (`DATABASE_URL`), never from a config file, so
no credentials live in the repository. Tests and offline SQL rendering pass their own URL through
the `sqlalchemy.url` option instead (`site_api.db.migrate.alembic_config`).

Migrations run on a synchronous psycopg 3 connection: the same driver as the async API engine, and
Alembic does not need the event loop. There is no `target_metadata`: the schema is written by hand
in each revision (no autogenerate), so every change is explicit and reviewable.
"""

from alembic import context
from sqlalchemy import create_engine, pool

from site_api.core.config import Settings

# Guards for the deploy (infra/deploy.sh): a migration that waits for a lock held by the running API
# fails after LOCK_TIMEOUT instead of hanging, and no statement runs longer than STATEMENT_TIMEOUT.
# Postgres settings for this connection only (libpq `options`).
LOCK_TIMEOUT = "5s"
STATEMENT_TIMEOUT = "120s"


def database_url() -> str:
    """The URL to migrate: an explicit `sqlalchemy.url` option, else the `DATABASE_URL` setting."""
    explicit = context.config.get_main_option("sqlalchemy.url")
    if explicit:
        return explicit
    settings = Settings()  # pyright: ignore[reportCallIssue] -- read from the environment
    return settings.database_url.get_secret_value()


def run_migrations_offline() -> None:
    """Render the migrations as SQL without connecting (`alembic upgrade head --sql`)."""
    context.configure(
        url=database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run the migrations on a live database in one transaction (Postgres has transactional DDL)."""
    engine = create_engine(
        database_url(),
        poolclass=pool.NullPool,
        connect_args={
            "options": f"-c lock_timeout={LOCK_TIMEOUT} -c statement_timeout={STATEMENT_TIMEOUT}"
        },
    )
    try:
        with engine.connect() as connection:
            context.configure(connection=connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


# Alembic runs this file as a script for every command, so the work starts at module level.
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
