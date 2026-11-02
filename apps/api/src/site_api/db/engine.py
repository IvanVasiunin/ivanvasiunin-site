"""The async SQLAlchemy engine: one connection pool per process.

The engine is created when the app starts and disposed of when it stops (see `site_api.app`).
Creating it does not connect yet; the first query opens a connection.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from site_api.core.config import Settings


def create_engine(settings: Settings) -> AsyncEngine:
    """Create the engine for the configured database.

    - `pool_size` / `max_overflow` / `pool_timeout`: a bounded pool, so a burst of requests waits
      briefly for a connection instead of overloading Postgres.
    - `pool_pre_ping`: checks a pooled connection before reuse, so a database restart does not
      surface as an error on the next request.
    - `connect_timeout` (passed to psycopg): gives up on an unreachable server quickly.
    """
    return create_async_engine(
        settings.database_url.get_secret_value(),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_s,
        pool_pre_ping=True,
        connect_args={"connect_timeout": settings.db_connect_timeout_s},
    )
