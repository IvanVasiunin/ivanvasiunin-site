"""The application factory: builds a configured FastAPI app.

A factory (rather than a module-level app) lets every test build its own app with its own settings
and fakes. `site_api.main` calls it once for the real server.
"""

import asyncio
import logging
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from site_api.core.config import Settings
from site_api.core.errors import install_error_handlers
from site_api.core.openapi import register_contract_models
from site_api.core.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from site_api.db.engine import create_engine
from site_api.routers import health
from site_api.schemas.errors import ErrorResponse
from site_api.services.health import database_probe

logger: logging.Logger = logging.getLogger(__name__)

# Local origins of the Astro dev server (any port), allowed in development only.
_DEV_ORIGINS = r"http://(localhost|127\.0\.0\.1):\d+"


def _warn_about_proactor_loop() -> None:
    """Warn when the server runs on Windows' Proactor event loop, which async psycopg rejects.

    `uvicorn` without `--reload` picks that loop on Windows, and every database call (including the
    health check) would fail. `fastapi dev` uses the selector loop. Production runs on Linux.
    """
    # A separate platform check: type checkers on Linux treat the rest as unreachable, so the
    # Windows-only `ProactorEventLoop` name is not an error there.
    if sys.platform != "win32":
        return
    if isinstance(asyncio.get_running_loop(), asyncio.ProactorEventLoop):
        logger.warning(
            "running on the Proactor event loop: async psycopg cannot use it; "
            "start the server with `fastapi dev` instead"
        )


def create_app(settings: Settings) -> FastAPI:
    """Build the API for the given settings.

    The database engine is created at startup and disposed of at shutdown (the lifespan), so
    importing or building the app never opens a connection.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        _warn_about_proactor_loop()
        engine = create_engine(settings)
        app.state.database_probe = database_probe(
            engine, settings.db_health_timeout_s, settings.health_cache_ttl_s
        )
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(
        title="ivanvasiunin.com API",
        version=settings.app_version,
        lifespan=lifespan,
        # Development only: the interactive docs and the schema. In production the schema is not
        # served; the frontend types are generated from `app.openapi()` offline (ROADMAP 1.5).
        openapi_url=None if settings.is_production else "/api/openapi.json",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        # Every error response has the unified shape. 422 is listed explicitly: otherwise FastAPI
        # documents its own `HTTPValidationError` for routes with input, which we never return.
        responses={
            422: {"model": ErrorResponse, "description": "Invalid request (SPEC §4.3)"},
            "default": {"model": ErrorResponse, "description": "Error (SPEC §4.3)"},
        },
    )
    app.state.settings = settings
    install_error_handlers(app)
    _add_middleware(app, settings)
    app.include_router(health.router)
    register_contract_models(app)
    return app


def _add_middleware(app: FastAPI, settings: Settings) -> None:
    """Add the middleware stack. The last one added runs first (outermost).

    Order, outside in: CORS → request context → the routes. CORS is outermost so that every
    response, including the 500 written by the request context middleware, has CORS headers.
    The flip side: CORS answers preflight (`OPTIONS`) requests itself, without a request ID, and
    rejects a disallowed preflight with its own plain-text 400.
    """
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        # The Astro dev server runs on a changing local port; never allowed outside development.
        # Starlette matches the whole origin (fullmatch), so `http://localhost:1.evil.com` fails.
        allow_origin_regex=_DEV_ORIGINS if settings.app_env == "development" else None,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER, "Retry-After"],
        max_age=600,
    )
