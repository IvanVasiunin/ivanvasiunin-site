"""Checks behind `GET /api/health`: is the database answering?

The router depends on the `DatabaseProbe` type, not on SQLAlchemy, so contract tests can swap in a
probe that says "up" or "down" without a real database.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger: logging.Logger = logging.getLogger(__name__)

# A no-argument coroutine that answers "is the database reachable right now?".
type DatabaseProbe = Callable[[], Awaitable[bool]]


async def ping_database(engine: AsyncEngine, timeout_s: float) -> bool:
    """Run `SELECT 1` and report whether it succeeded within `timeout_s` seconds.

    Any failure counts as "down": the health contract (SPEC §4.5) promises `db: down`, never a 500.
    The log line carries only the kind of failure, never the URL or credentials.
    """
    try:
        async with asyncio.timeout(timeout_s), engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as error:
        logger.warning("database ping failed", extra={"error_type": type(error).__name__})
        return False
    return True


class CachedProbe:
    """Reuses one probe result for `ttl_s` seconds, with one ping in flight at a time.

    `/api/health` is public, so without this every request would take a pooled connection: a
    flood of health checks could starve the chat. With it, the database sees at most one ping per
    `ttl_s`, however many requests arrive.
    """

    def __init__(self, probe: DatabaseProbe, ttl_s: float) -> None:
        self._probe: DatabaseProbe = probe
        self._ttl_s: float = ttl_s
        self._lock: asyncio.Lock = asyncio.Lock()
        self._checked_at: float | None = None
        self._result: bool = False

    async def __call__(self) -> bool:
        """Return the cached result, or ping once if it is older than the TTL."""
        async with self._lock:
            # `monotonic` is unaffected by wall-clock changes, so the TTL cannot jump.
            now = time.monotonic()
            if self._checked_at is None or now - self._checked_at >= self._ttl_s:
                self._result = await self._probe()
                self._checked_at = now
            return self._result


def database_probe(engine: AsyncEngine, timeout_s: float, ttl_s: float) -> DatabaseProbe:
    """The app's probe: `ping_database` bound to an engine, behind a short-lived cache."""

    async def probe() -> bool:
        return await ping_database(engine, timeout_s)

    return CachedProbe(probe, ttl_s)
