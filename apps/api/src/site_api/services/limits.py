"""The chat's input limits (ROADMAP 4.1, ADR-0004 layer 1, SPEC US-A13).

Every check runs before the answer stream starts and before any model call, so a visitor who hits
a limit costs nothing and gets a JSON error with a code (SPEC §4.3):

- requests per IP per minute and per day → 429 `rate_limited` (the real enforcement);
- answers streaming at once per IP → 429 `rate_limited` (a stream is long, so a per-minute count
  alone would let one IP hold many of them open);
- questions per session → 429 `session_limit` (a UX nicety only: the client makes the session ID
  and can make a new one at will);
- the day's estimated spend → 503 `budget_exceeded`, for everyone, until midnight UTC.

All counters live in this process's memory (one API instance, ARCHITECTURE §2). IP addresses are
used as counter keys only: never logged, never stored (SPEC §6.6). A restart resets the counters;
the hard spend limit on the OpenAI project is the backstop behind the daily budget.

The budget is checked before an answer and its cost is added after it, so answers already
streaming when the budget runs out still finish: the overshoot is at most the streams in progress
(a few cents at ~$0.0065 an answer). Accepted for a personal site; a reservation scheme would be
exact but is not worth its complexity here.
"""

import ipaddress
import math
import time
from datetime import UTC, datetime, timedelta

from fastapi import status
from limits import RateLimitItem, RateLimitItemPerDay, RateLimitItemPerMinute
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter

from site_api.core.config import Settings
from site_api.core.errors import ApiError

IPV6 = 6
# The block one IPv6 customer usually gets; counted as one visitor (`client_key`).
IPV6_PREFIX = 64

# Safe, user-facing English text (SPEC §4.3).
_RATE_LIMITED = "Too many questions in a short time. Please wait a moment."
_TOO_MANY_STREAMS = "Elio is still answering your other questions. Please wait for them to finish."
_SESSION_LIMIT = "This chat has reached its question limit. Please come back later."
_BUDGET_EXCEEDED = (
    "Elio has answered all the questions it can for today. Please come back tomorrow."
)


class DailySpend:
    """The estimated cost of today's answers (UTC), summed in memory."""

    def __init__(self, budget_usd: float) -> None:
        """Track spend against a daily budget in USD."""
        self._budget_usd = budget_usd
        self._day = _today()
        self._spent_usd = 0.0

    @property
    def spent_usd(self) -> float:
        """Today's spend so far."""
        self._roll_over()
        return self._spent_usd

    def add(self, cost_usd: float) -> None:
        """Count one answer's estimated cost."""
        self._roll_over()
        self._spent_usd += cost_usd

    def exceeded(self) -> bool:
        """Whether today's spend has reached the budget."""
        return self.spent_usd >= self._budget_usd

    def _roll_over(self) -> None:
        """Start from zero when a new UTC day begins."""
        today = _today()
        if today != self._day:
            self._day = today
            self._spent_usd = 0.0


class ChatLimits:
    """The per-IP, per-session and budget checks of `POST /api/chat`."""

    def __init__(self, settings: Settings, spend: DailySpend) -> None:
        """Build the counters from the configured limits."""
        # A moving window counts the requests of the last minute (or day) at any moment, so a
        # burst at the boundary of two fixed windows cannot double the limit.
        self._limiter = MovingWindowRateLimiter(MemoryStorage())
        self._ip_limits: tuple[RateLimitItem, ...] = (
            RateLimitItemPerMinute(settings.chat_requests_per_minute_per_ip),
            RateLimitItemPerDay(settings.chat_requests_per_day_per_ip),
        )
        self._session_limit: RateLimitItem = RateLimitItemPerDay(settings.session_max_questions)
        self._max_question_chars = settings.max_question_chars
        self._max_streams = settings.chat_streams_per_ip
        self._streams: dict[str, int] = {}
        self._spend = spend

    async def check_ip(self, ip: str) -> None:
        """Count a request from this IP; 429 `rate_limited` once a limit is reached."""
        # Test every window first, then count in all of them: a request refused by the day's limit
        # must not also use up a place in the minute's window.
        for limit in self._ip_limits:
            if not await self._limiter.test(limit, "ip", ip):
                raise ApiError(
                    "rate_limited",
                    _RATE_LIMITED,
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    retry_after_s=await self._retry_after(limit, "ip", ip),
                )
        for limit in self._ip_limits:
            await self._limiter.hit(limit, "ip", ip)

    def check_question_length(self, question: str) -> None:
        """413 `input_too_long` when the (trimmed) question is over the configured length."""
        if len(question) > self._max_question_chars:
            raise ApiError(
                "input_too_long",
                f"The question is too long. Please keep it under {self._max_question_chars} "
                "characters.",
                status.HTTP_413_CONTENT_TOO_LARGE,
            )

    async def check_session(self, session_id: str) -> None:
        """Count a question of this session; 429 `session_limit` once the limit is reached."""
        if not await self._limiter.hit(self._session_limit, "session", session_id):
            raise ApiError(
                "session_limit",
                _SESSION_LIMIT,
                status.HTTP_429_TOO_MANY_REQUESTS,
                retry_after_s=await self._retry_after(self._session_limit, "session", session_id),
            )

    def check_budget(self) -> None:
        """503 `budget_exceeded` when today's spend has reached the budget."""
        if self._spend.exceeded():
            raise ApiError(
                "budget_exceeded",
                _BUDGET_EXCEEDED,
                status.HTTP_503_SERVICE_UNAVAILABLE,
                retry_after_s=seconds_until_tomorrow(),
            )

    def open_stream(self, ip: str) -> None:
        """Take one of this IP's stream slots; 429 `rate_limited` when all are in use."""
        active = self._streams.get(ip, 0)
        if active >= self._max_streams:
            raise ApiError(
                "rate_limited",
                _TOO_MANY_STREAMS,
                status.HTTP_429_TOO_MANY_REQUESTS,
                retry_after_s=1,
            )
        self._streams[ip] = active + 1

    def close_stream(self, ip: str) -> None:
        """Give the slot back when the stream has ended, however it ended."""
        active = self._streams.get(ip, 0) - 1
        if active > 0:
            self._streams[ip] = active
        else:
            # No entry for an IP without streams: the dict never grows with past visitors.
            self._streams.pop(ip, None)

    def active_streams(self, ip: str) -> int:
        """How many answers this IP is receiving right now."""
        return self._streams.get(ip, 0)

    async def _retry_after(self, limit: RateLimitItem, *key: str) -> int:
        """Whole seconds until the window frees a slot (at least 1)."""
        stats = await self._limiter.get_window_stats(limit, *key)
        return max(1, math.ceil(stats.reset_time - time.time()))


def client_key(address: str) -> str:
    """The key one visitor's requests are counted under: the IPv4 address, or the IPv6 /64.

    One IPv6 customer usually gets a whole /64 (2^64 addresses) and can pick a new one for every
    request: counting by the full address would let them past every per-IP limit.
    """
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        # Not an address (a test client, a missing peer): one shared key, which can only refuse
        # too much, never let too much through.
        return address
    if ip.version == IPV6:
        return str(ipaddress.ip_network(f"{ip}/{IPV6_PREFIX}", strict=False))
    return str(ip)


def _today() -> str:
    """Today's date in UTC, the day the budget counts."""
    return datetime.now(UTC).date().isoformat()


def seconds_until_tomorrow() -> int:
    """Whole seconds until the next midnight UTC, when the budget starts again."""
    now = datetime.now(UTC)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, math.ceil((tomorrow - now).total_seconds()))
