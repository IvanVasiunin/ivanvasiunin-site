"""Test-wide setup shared by every test package."""

import asyncio
from collections.abc import Callable, Mapping

import pytest


def pytest_asyncio_loop_factories(
    config: pytest.Config,
    item: pytest.Item,
) -> Mapping[str, Callable[[], asyncio.AbstractEventLoop]]:
    """Run every async test on the selector event loop, on every OS.

    Windows defaults to the Proactor loop, which async psycopg refuses to use. Production (Linux)
    and `fastapi dev` use the selector loop, so the tests do too. One factory keeps test names as
    they are (pytest-asyncio 1.4 hook).
    """
    return {"selector": asyncio.SelectorEventLoop}
