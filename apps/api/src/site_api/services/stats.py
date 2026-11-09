"""Chat statistics: one row per answer, deleted after the retention period (ROADMAP 4.6).

SPEC §6.6, rules/postgres.md; the table is `chat_answers` (migration 0002).

A row says how an answer went (class, language, finish reason or error code, cost, duration)
and keeps the question only masked (`services/masking.py`). Writing it must never slow an answer
or break it: the service hands the row over and moves on; a failed write is logged and dropped.
A background job deletes rows older than CHAT_STATS_RETENTION_DAYS.
"""

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine

from site_api.db.tables import CHAT_ANSWERS
from site_api.schemas.chat import ChatEvent, DoneEvent, ErrorEvent, RouteEvent, UsageEvent
from site_api.services.masking import mask_text

logger: logging.Logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AnswerRecord:
    """One answer, as the statistics keep it; never the IP, the session or the full question."""

    route: str | None
    language: str | None
    finish_reason: str | None
    error_code: str | None
    cost_usd: float
    total_ms: int | None
    question_masked: str


class StatsRecorder(Protocol):
    """Where answer records go (`PostgresStats`; a fake in tests)."""

    async def record(self, record: AnswerRecord) -> None:
        """Store one record."""
        ...


def answer_record(question: str, events: Sequence[ChatEvent]) -> AnswerRecord:
    """The record of one answer from the events it produced (all null when it was stopped)."""
    route = next((e for e in events if isinstance(e, RouteEvent)), None)
    usage = next((e for e in events if isinstance(e, UsageEvent)), None)
    done = next((e for e in events if isinstance(e, DoneEvent)), None)
    error = next((e for e in events if isinstance(e, ErrorEvent)), None)
    return AnswerRecord(
        route=route.route if route else None,
        language=route.language if route else None,
        finish_reason=done.finish_reason if done else None,
        error_code=error.code if error else None,
        cost_usd=usage.estimated_cost_usd if usage else 0.0,
        total_ms=usage.total_ms if usage else None,
        question_masked=mask_text(question),
    )


class PostgresStats:
    """`chat_answers` through the API's async engine."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Use the app's engine (one pool per process)."""
        self._engine = engine

    async def record(self, record: AnswerRecord) -> None:
        """Insert one row."""
        async with self._engine.begin() as connection:
            await connection.execute(sa.insert(CHAT_ANSWERS).values(**asdict(record)))

    async def purge(self, older_than_days: int) -> int:
        """Delete the rows older than `older_than_days`; return how many went."""
        cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
        async with self._engine.begin() as connection:
            result = await connection.execute(
                sa.delete(CHAT_ANSWERS).where(CHAT_ANSWERS.c.created_at < cutoff)
            )
        return result.rowcount


class Purger(Protocol):
    """What the retention job needs (`PostgresStats`; a fake in tests)."""

    async def purge(self, older_than_days: int) -> int:
        """Delete old rows; return how many."""
        ...


async def retention_loop(stats: Purger, older_than_days: int, interval_s: float) -> None:
    """Delete old statistics now and then every `interval_s`, until cancelled at shutdown.

    A failed run (the database is down) is logged and retried at the next interval: the job
    never stops on its own.
    """
    while True:
        try:
            deleted = await stats.purge(older_than_days)
            logger.info("chat statistics purged", extra={"count": deleted})
        except Exception as error:
            logger.warning(
                "chat statistics purge failed", extra={"error_type": type(error).__name__}
            )
        await asyncio.sleep(interval_s)
