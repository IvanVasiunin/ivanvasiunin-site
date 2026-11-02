"""Contract of `GET /api/health` (SPEC §4.5)."""

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from site_api.app import create_app
from site_api.core.config import Settings

from .conftest import DatabaseState


async def test_reports_ok_when_the_database_answers(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok", "version": "test-sha"}


async def test_reports_503_when_the_database_is_down(
    client: AsyncClient, database: DatabaseState
) -> None:
    database.up = False

    response = await client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "db": "down", "version": "test-sha"}


async def test_the_real_probe_reports_an_unreachable_database_as_down(settings: Settings) -> None:
    # No overrides: the lifespan creates the engine and the probe, which pings port 1 and fails.
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")

    assert response.status_code == 503
    assert response.json()["db"] == "down"


async def test_the_openapi_schema_documents_both_outcomes(app: FastAPI) -> None:
    operation = app.openapi()["paths"]["/api/health"]["get"]

    for status_code in ("200", "503"):
        schema = operation["responses"][status_code]["content"]["application/json"]["schema"]
        assert schema == {"$ref": "#/components/schemas/HealthResponse"}
