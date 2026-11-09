"""The exported OpenAPI schema: stable, complete, and in the unified error format."""

import json
from pathlib import Path

from site_api.openapi_export import main, openapi_json


def test_the_export_is_stable_between_runs() -> None:
    assert openapi_json() == openapi_json()


def test_the_export_has_a_fixed_version_and_the_contract_schemas() -> None:
    schema = json.loads(openapi_json())

    assert schema["info"]["version"] == "contract"
    assert "/api/health" in schema["paths"]
    for name in ("HealthResponse", "ErrorResponse", "ErrorBody"):
        assert name in schema["components"]["schemas"]
    # FastAPI's own validation error shape is never returned, so it is not in the contract.
    assert "HTTPValidationError" not in schema["components"]["schemas"]


def test_the_public_schema_holds_no_internals() -> None:
    # The schema is committed to a public repository: model descriptions and examples must never
    # carry prompt text, credentials or provider details (guards future chat models too).
    schema_text = openapi_json().lower()

    for marker in ("system_prompt", "password", "openai", "anthropic", "secret", "api_key"):
        assert marker not in schema_text, marker


def test_main_writes_the_schema_to_the_given_file(tmp_path: Path) -> None:
    output = tmp_path / "openapi.json"

    assert main([str(output)]) == 0
    assert output.read_text(encoding="utf-8") == openapi_json()


def test_main_needs_exactly_one_argument() -> None:
    assert main([]) == 2
