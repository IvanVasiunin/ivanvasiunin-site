"""Write the API's OpenAPI schema to a file, without starting a server or a database.

The schema is the single source of the frontend's API types (ROADMAP 1.5): `pnpm --dir apps/web
run gen:api` calls this module, then turns the JSON into TypeScript. Production does not serve the
schema (`/api/openapi.json` is off there), so it is built here from the code instead.

Usage: `uv run --directory apps/api python -m site_api.openapi_export <output.json>`
"""

import json
import sys
from pathlib import Path

from pydantic import SecretStr

from site_api.app import create_app
from site_api.core.config import Settings


def openapi_json() -> str:
    """The schema as stable JSON: sorted keys and a fixed version, so diffs show real changes.

    The app is built with placeholder settings: building it opens no connection, and the schema
    does not depend on them. The version is fixed to `contract` so a deploy SHA never makes the
    generated types look stale.
    """
    settings = Settings(
        app_env="development",
        app_version="contract",
        database_url=SecretStr("postgresql+psycopg://openapi-export@localhost/unused"),
    )
    schema = create_app(settings).openapi()
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    """Write the schema to the path given as the only argument."""
    if len(argv) != 1:
        sys.stderr.write("usage: python -m site_api.openapi_export <output.json>\n")
        return 2
    Path(argv[0]).write_text(openapi_json(), encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
