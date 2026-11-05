"""`POST /api/chat`: the request and the Server-Sent Events of the answer stream (SPEC §4.1, §4.2).

Every event's `data` is one JSON object with a `type` discriminator; clients dispatch on it (the SSE
`event:` field is not used). The order of events:

    about_ivan:                    route → sources → token* → usage → done
    no_info (nothing relevant):    route → sources (empty) → token+ (templated) → usage → done
    greeting / off_topic / injection:
                                   route → token+ (templated) → usage → done
    any failure:                   … → error   (terminal, no done afterwards)

On the wire every key is present, `null` where a value is absent (the default serialisation; the
OpenAPI components use the serialisation schema, so the generated TS types mark them required).
SPEC §4.2 omits such keys in its examples for brevity; clients must accept both.

The endpoint is `routers/chat.py` (ROADMAP 3.8); the chat UI is built against the generated types
(`core/openapi.py` also registers the models, under fixed names).
"""

from typing import Annotated, Literal

from pydantic import UUID4, BaseModel, Field, StringConstraints, TypeAdapter

from site_api.schemas.errors import ErrorCode

# ── Request ───────────────────────────────────────────────────────────────────────────────────

# Hard upper bounds of the request shape. The effective limits are lower and come from config
# (MAX_QUESTION_CHARS → `input_too_long` in routers/chat.py; HISTORY_MAX_TURNS in services/chat.py);
# these only stop absurd payloads before any of that runs.
_MESSAGE_HARD_MAX = 4000
_HISTORY_HARD_MAX = 40


class ChatTurn(BaseModel):
    """One earlier message of the conversation. Untrusted: it is passed to the model as data."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=_MESSAGE_HARD_MAX)


class ChatRequest(BaseModel):
    """A visitor's question with the client's session and recent history."""

    # Trimmed here, so a blank question is rejected; the effective maximum, MAX_QUESTION_CHARS
    # (config, default 500), is checked on the trimmed text by the router.
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=_MESSAGE_HARD_MAX)
    ]
    # A UUID v4 the client generates and keeps in sessionStorage.
    session_id: UUID4
    # The last turns, oldest first; capped by config (default 6 turns).
    history: list[ChatTurn] = Field(default_factory=list[ChatTurn], max_length=_HISTORY_HARD_MAX)


# ── Events ────────────────────────────────────────────────────────────────────────────────────

Route = Literal["about_ivan", "greeting", "off_topic", "injection"]
SourceType = Literal["cv", "experience", "personal", "site_docs", "github_readme"]
FinishReason = Literal["stop", "length", "templated", "no_info"]
# The longest `snippet` of a source (SPEC §4.2).
SNIPPET_MAX_CHARS = 200


class RouteEvent(BaseModel):
    """The router's decision; always the first event."""

    type: Literal["route"]
    route: Route
    # BCP-47 primary language tag detected for the question, e.g. `en`.
    language: str = Field(min_length=2, max_length=8)


class SourceItem(BaseModel):
    """One retrieved chunk above the relevance threshold."""

    # Equals the point id in points.json, so the map can highlight it.
    chunk_id: str
    # Normalised fused relevance, 0..1.
    score: float = Field(ge=0, le=1)
    source_type: SourceType
    title: str
    section: str | None = None
    # A page of this site or a public GitHub README; null when the source has no URL.
    url: str | None = None
    snippet: str = Field(max_length=SNIPPET_MAX_CHARS)


class SourcesEvent(BaseModel):
    """Retrieved sources, by score descending.

    An empty list means nothing was relevant; a templated "no information" answer follows.
    """

    type: Literal["sources"]
    items: list[SourceItem]


class TokenEvent(BaseModel):
    """The next piece of the answer, in Markdown."""

    type: Literal["token"]
    text: str


class NodeUsage(BaseModel):
    """Time and tokens of one graph step (Under the hood, SPEC US-A9)."""

    name: str
    ms: int = Field(ge=0)
    # Only for steps that call a model: the model name, never its configuration.
    model: str | None = None
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    embedding_tokens: int | None = Field(default=None, ge=0)


class UsageEvent(BaseModel):
    """Per-step timings and tokens; sent once, right before `done`."""

    type: Literal["usage"]
    nodes: list[NodeUsage]
    total_ms: int = Field(ge=0)
    # Computed from the model prices in config.
    estimated_cost_usd: float = Field(ge=0)


class DoneEvent(BaseModel):
    """The successful end of the stream."""

    type: Literal["done"]
    # A server-generated UUID v4.
    message_id: UUID4
    finish_reason: FinishReason


class ErrorEvent(BaseModel):
    """A failure during the stream; terminal, no `done` follows."""

    type: Literal["error"]
    # The stream itself never sends `invalid_request` or `not_found` (they happen only before a
    # stream, SPEC §4.3). The type keeps every code on purpose: the chat client folds errors
    # returned before the stream into this same event, so the UI has one error path and one
    # message table.
    code: ErrorCode
    # Safe, user-facing English text.
    message: str
    retry_after_s: int | None = Field(default=None, ge=0)


ChatEvent = Annotated[
    RouteEvent | SourcesEvent | TokenEvent | UsageEvent | DoneEvent | ErrorEvent,
    Field(discriminator="type"),
]
"""One event of the chat stream, discriminated by `type`."""

CHAT_EVENT_ADAPTER: TypeAdapter[ChatEvent] = TypeAdapter(ChatEvent)
"""Validates and serialises `ChatEvent`s (tests, the OpenAPI registration)."""
