"""Tracing to Langfuse, masked (ROADMAP 4.6 DoD: no unmasked question in a captured trace).

A real Langfuse client and LangChain handler trace a real run of the chat graph (on fake models),
but export to memory instead of the network; the test then reads every exported attribute.
"""

import json
import uuid

from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import SecretStr

from site_api.core.config import Settings
from site_api.graph.nodes import ChatModels
from site_api.schemas.chat import ChatRequest
from site_api.services.chat import ChatObservers, ChatService
from site_api.services.limits import DailySpend
from site_api.services.tracing import create_tracing

from .chat_fakes import FakeRetriever, answering, routing

# Personal data a visitor might type. The phone number is a template, every "N" a "0" (gitleaks
# blocks any phone-shaped literal).
EMAIL = "jane.doe@example.com"
URL = "https://private.example.com/cv"
PHONE = "+NN NNN NNN NNNN".replace("N", "0")
QUESTION = f"Ivan, I am {EMAIL}, call {PHONE}, see {URL}: what does Ivan do?"


def test_without_keys_tracing_is_off(settings: Settings) -> None:
    assert create_tracing(settings) is None


def _strings(value: object) -> list[str]:
    """Every string in an OpenTelemetry attribute value."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)):
        return [item for item in value if isinstance(item, str)]  # pyright: ignore[reportUnknownVariableType] -- OTel values are untyped sequences
    return []


async def test_no_unmasked_personal_data_reaches_a_captured_trace(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    keyed = settings.model_copy(
        update={
            # A unique key: Langfuse keeps one client per public key in the process.
            "langfuse_public_key": f"pk-lf-test-{uuid.uuid4().hex}",
            "langfuse_secret_key": SecretStr("sk-lf-test-placeholder"),
        }
    )
    tracing = create_tracing(keyed, span_exporter=exporter)
    assert tracing is not None
    chat = ChatService(
        FakeRetriever(),
        ChatModels(routing(), answering("Ivan builds UI.")),
        keyed,
        DailySpend(1.0),
        ChatObservers(callbacks=[tracing.handler]),
    )

    _ = [e async for e in chat.answer(ChatRequest(message=QUESTION, session_id=uuid.uuid4()))]
    tracing.client.flush()

    spans = exporter.get_finished_spans()
    texts = [
        text
        for span in spans
        for value in (span.attributes or {}).values()
        for text in _strings(value)
    ]
    assert spans, "the run should be traced"
    # The question did reach the trace, masked: the test would pass vacuously otherwise.
    assert any("[email]" in text for text in texts)
    # The hook masks attributes only: names, events and resource attributes must carry nothing
    # a visitor typed (a future SDK version that put text there would fail this test).
    texts += [span.name for span in spans]
    texts += [event.name for span in spans for event in span.events]
    texts += [
        text
        for span in spans
        for value in span.resource.attributes.values()
        for text in _strings(value)
    ]
    for text in texts:
        assert EMAIL not in text
        assert URL not in text
        assert PHONE not in text
    # Langfuse's JSON attributes stay valid JSON after masking.
    for span in spans:
        for key, value in (span.attributes or {}).items():
            # Plain text stays plain text; what was a JSON object or list must still parse.
            is_json = isinstance(value, str) and value.startswith(("{", "["))
            if key.endswith((".input", ".output")) and is_json:
                json.loads(str(value))
    tracing.shutdown()


def test_placeholder_keys_leave_tracing_off(settings: Settings) -> None:
    copied = settings.model_copy(
        update={
            "langfuse_public_key": "replace-me",
            "langfuse_secret_key": SecretStr("replace-me"),
        }
    )

    assert create_tracing(copied) is None
