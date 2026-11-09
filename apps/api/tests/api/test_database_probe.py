"""`ping_database` and `CachedProbe`: up, down, slow, cached, and no credentials in the log."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import cast

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from site_api.services.health import CachedProbe, ping_database

from .conftest import UNREACHABLE_DATABASE_URL


class _Connection:
    async def execute(self, _statement: object) -> None:
        return None


class _StubEngine:
    """Stands in for AsyncEngine.connect(): answers at once, or only after `delay_s`."""

    def __init__(self, delay_s: float = 0) -> None:
        self.delay_s: float = delay_s

    @asynccontextmanager
    async def connect(self) -> AsyncGenerator[_Connection]:
        await asyncio.sleep(self.delay_s)
        yield _Connection()


def _engine(stub: _StubEngine) -> AsyncEngine:
    return cast(AsyncEngine, stub)


class _CountingProbe:
    """A fake probe that counts its calls and can be made slow."""

    def __init__(self, result: bool = True, delay_s: float = 0) -> None:
        self.calls: int = 0
        self.result: bool = result
        self.delay_s: float = delay_s

    async def __call__(self) -> bool:
        self.calls += 1
        await asyncio.sleep(self.delay_s)
        return self.result


async def test_a_database_that_answers_is_up() -> None:
    assert await ping_database(_engine(_StubEngine()), timeout_s=1)


async def test_a_database_slower_than_the_timeout_is_down() -> None:
    assert not await ping_database(_engine(_StubEngine(delay_s=5)), timeout_s=0.05)


async def test_an_unreachable_database_is_down_and_the_log_has_no_url(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Port 1 is refused (Linux) or times out (Windows); the 1 s connect timeout ends it either way.
    engine = create_async_engine(UNREACHABLE_DATABASE_URL, connect_args={"connect_timeout": 1})
    try:
        with caplog.at_level(logging.WARNING, logger="site_api.services.health"):
            assert not await ping_database(engine, timeout_s=5)
    finally:
        await engine.dispose()

    [record] = caplog.records
    # A real driver error. On Windows' Proactor loop psycopg would fail with InterfaceError before
    # even trying to connect, so this also guards the event loop setup (tests/conftest.py).
    assert getattr(record, "error_type", None) == "OperationalError"
    logged = record.getMessage() + str(record.__dict__)
    assert "127.0.0.1" not in logged
    assert "site@" not in logged


async def test_the_cache_reuses_a_result_within_its_ttl() -> None:
    probe = _CountingProbe()
    cached = CachedProbe(probe, ttl_s=60)

    assert await cached()
    assert await cached()
    assert probe.calls == 1


async def test_the_cache_pings_again_after_its_ttl() -> None:
    probe = _CountingProbe(result=False)
    cached = CachedProbe(probe, ttl_s=0)

    assert not await cached()
    assert not await cached()
    assert probe.calls == 2


async def test_concurrent_checks_share_one_ping() -> None:
    probe = _CountingProbe(delay_s=0.05)
    cached = CachedProbe(probe, ttl_s=60)

    results = await asyncio.gather(*(cached() for _ in range(20)))

    assert all(results)
    assert probe.calls == 1
