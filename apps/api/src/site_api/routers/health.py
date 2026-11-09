"""`GET /api/health` (SPEC §4.5): a thin HTTP layer over the database probe."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from site_api.core.config import Settings
from site_api.deps import get_app_settings, get_database_probe
from site_api.schemas.health import HealthResponse
from site_api.services.health import DatabaseProbe

router: APIRouter = APIRouter(prefix="/api", tags=["health"])


@router.get(
    "/health",
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
)
async def health(
    response: Response,
    settings: Annotated[Settings, Depends(get_app_settings)],
    probe: Annotated[DatabaseProbe, Depends(get_database_probe)],
) -> HealthResponse:
    """Report whether the API and its database are up, and which build is running."""
    database_up = await probe()
    if not database_up:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if database_up else "unavailable",
        db="ok" if database_up else "down",
        version=settings.app_version,
    )
