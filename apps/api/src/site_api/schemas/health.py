"""Response of `GET /api/health` (SPEC §4.5), used by Compose health checks and monitoring."""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Liveness of the API and reachability of its database."""

    # `unavailable` (with HTTP 503) when a dependency the API needs is down.
    status: Literal["ok", "unavailable"]
    db: Literal["ok", "down"]
    # The deployed git SHA, so a health check also shows which build is running.
    version: str
