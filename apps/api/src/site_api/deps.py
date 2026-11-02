"""Request dependencies shared by routers: the running app's settings and services.

They live on `app.state`, set by the factory (`site_api.app`), so each app instance (and each test)
has its own; tests swap a dependency with `app.dependency_overrides`.
"""

from fastapi import Request

from site_api.core.config import Settings
from site_api.services.health import DatabaseProbe


def get_app_settings(request: Request) -> Settings:
    """Settings of the running app."""
    settings: Settings = request.app.state.settings
    return settings


def get_database_probe(request: Request) -> DatabaseProbe:
    """The database probe of the running app (created at startup, so it needs the lifespan)."""
    probe: DatabaseProbe = request.app.state.database_probe
    return probe
