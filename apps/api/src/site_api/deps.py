"""Request dependencies shared by routers: the running app's settings and services.

They live on `app.state`, set by the factory (`site_api.app`), so each app instance (and each test)
has its own; tests swap a dependency with `app.dependency_overrides`.
"""

from fastapi import Request, status

from site_api.core.config import Settings
from site_api.core.errors import ApiError
from site_api.services.chat import ChatService
from site_api.services.health import DatabaseProbe
from site_api.services.limits import ChatLimits, client_key


def get_app_settings(request: Request) -> Settings:
    """Settings of the running app."""
    settings: Settings = request.app.state.settings
    return settings


def get_database_probe(request: Request) -> DatabaseProbe:
    """The database probe of the running app (created at startup, so it needs the lifespan)."""
    probe: DatabaseProbe = request.app.state.database_probe
    return probe


def get_chat_limits(request: Request) -> ChatLimits:
    """The chat limits of the running app (created with the app, no lifespan needed)."""
    limits: ChatLimits = request.app.state.chat_limits
    return limits


def client_ip(request: Request) -> str:
    """The key of the visitor's per-IP limits: the IP, or its IPv6 /64 (never logged or stored).

    Behind Caddy, uvicorn's `--proxy-headers` with `FORWARDED_ALLOW_IPS` (apps/api/Dockerfile) puts
    the visitor's address here, not the proxy's. Caddy replaces any `X-Forwarded-For` a client
    sends, so it can't be spoofed from outside.
    """
    return client_key(request.client.host if request.client is not None else "unknown")


def get_chat_service(request: Request) -> ChatService:
    """The chat service of the running app, or a 503 before the stream when chat is off.

    The lifespan sets `None` when a model API key is missing (`create_chat_service`).
    """
    service: ChatService | None = getattr(request.app.state, "chat_service", None)
    if service is None:
        raise ApiError(
            "upstream_unavailable",
            "Elio is unavailable right now. Please try again later.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return service
