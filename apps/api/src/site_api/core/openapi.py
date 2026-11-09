"""Add the chat contract models to the OpenAPI schema as named components.

The chat models (`schemas/chat.py`) were part of the contract before `/api/chat` existed, and the
chat UI was built against the generated types; ADR-0001 names this fallback: register the models as
components explicitly. Now that the route exists, it still guarantees one named `ChatEvent` union
(and `ChatRequest`) for the frontend: FastAPI inlines the stream's item type under a generated
title.
"""

from typing import Literal

from fastapi import FastAPI
from pydantic import TypeAdapter

from site_api.schemas.chat import CHAT_EVENT_ADAPTER, ChatEvent, ChatRequest

# OpenAPI keeps reusable schemas under `components.schemas`; pydantic writes `$ref`s in this form.
_REF_TEMPLATE = "#/components/schemas/{model}"

# (component name, JSON schema mode, adapter). Requests are validated input; events are output.
type _Adapter = TypeAdapter[ChatRequest] | TypeAdapter[ChatEvent]
_CONTRACT: tuple[tuple[str, Literal["validation", "serialization"], _Adapter], ...] = (
    ("ChatRequest", "validation", TypeAdapter(ChatRequest)),
    ("ChatEvent", "serialization", CHAT_EVENT_ADAPTER),
)

type _JsonObject = dict[str, object]


def contract_schemas() -> dict[str, _JsonObject]:
    """The JSON schemas of the contract models, keyed by component name, with their sub-models."""
    # `json_schemas` builds every schema in one pass, so shared sub-models (SourceItem, …) are
    # defined once; `ref_template` makes their `$ref`s point at OpenAPI components.
    by_key, top = TypeAdapter.json_schemas(
        [(name, mode, adapter) for name, mode, adapter in _CONTRACT],
        ref_template=_REF_TEMPLATE,
    )
    schemas: dict[str, _JsonObject] = dict(top.get("$defs", {}))
    for (name, _mode), schema in by_key.items():
        # A plain model comes back as a `$ref` to its own definition; only unions need a component.
        if "$ref" not in schema:
            schemas[name] = schema
    return schemas


def register_contract_models(app: FastAPI) -> None:
    """Make `app.openapi()` also include the contract models as components.

    Replacing `app.openapi` is FastAPI's documented way to extend the schema
    (https://fastapi.tiangolo.com/how-to/extending-openapi/). FastAPI generates the event
    components of `/api/chat` under the same names; a test (tests/api/test_chat.py) checks that
    they equal these ones, so this registration can never hide a difference.
    """
    build = app.openapi

    def openapi() -> _JsonObject:
        # FastAPI builds the schema once and caches it on the app; extend it on that first build.
        cached = app.openapi_schema
        if cached is not None:
            return cached
        schema = build()
        schema.setdefault("components", {}).setdefault("schemas", {}).update(contract_schemas())
        return schema

    app.openapi = openapi
