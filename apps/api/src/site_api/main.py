"""Entry point for the server: `fastapi dev src/site_api/main.py` (or uvicorn in production).

Builds the app once from the environment. Importing this module without `DATABASE_URL` set fails
on purpose: the API cannot run without a database. Tests use `site_api.app.create_app` with their
own settings instead of importing this module.
"""

from fastapi import FastAPI

from site_api.app import create_app
from site_api.core.config import Settings
from site_api.core.logging import configure_logging

# pyright cannot see that pydantic-settings fills the required field from the environment.
settings: Settings = Settings()  # pyright: ignore[reportCallIssue]
# JSON logs for the server process only; tests keep pytest's log capture.
configure_logging(settings.log_level)
app: FastAPI = create_app(settings)
