"""Traces of every chat run in Langfuse Cloud (EU), masked before export (ROADMAP 4.6).

ADR-0001 / ADR-0008: Langfuse's LangChain callback handler sees the graph's run (every node,
every model call with its prompt and output). SPEC §6.6: question texts leave the server only
masked, so every string attribute of every exported span goes through `mask_text` (emails, phone
numbers and URLs replaced) in Langfuse's export hook, `mask_otel_spans`, the hook its docs
recommend for SDK v5: it runs on the final span attributes, whichever part of the SDK set them.

Tracing is off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are both set: local runs and
tests never send anything.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import cast

from langchain_core.callbacks import BaseCallbackHandler
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler
from langfuse.types import (
    AttributeValue,
    MaskOtelSpansParams,
    MaskOtelSpansResult,
    OtelSpanIdentifier,
    OtelSpanPatch,
)
from opentelemetry.sdk.trace.export import SpanExporter

from site_api.core.config import Settings
from site_api.services.masking import mask_json_text

logger: logging.Logger = logging.getLogger(__name__)

# The value `.env.example` uses for keys that are not filled in.
PLACEHOLDER = "replace-me"


def mask_otel_spans(*, params: MaskOtelSpansParams) -> MaskOtelSpansResult | None:
    """Replace emails, phone numbers and URLs in every string attribute of the batch.

    Strings inside sequences are masked too. Langfuse drops the whole batch if this raises, so it
    only does plain string work: a failure here can lose traces but never leak text.
    """
    patches: dict[OtelSpanIdentifier, OtelSpanPatch] = {}
    for identifier, span in params.spans.items():
        replacements: dict[str, AttributeValue] = {}
        for key, value in span.attributes.items():
            masked = _mask_value(value)
            if masked != value:
                replacements[key] = masked
        if replacements:
            patches[identifier] = OtelSpanPatch(set_attributes=replacements)
    return MaskOtelSpansResult(span_patches=patches) if patches else None


def _mask_value(value: AttributeValue) -> AttributeValue:
    """A string masked, a sequence of strings masked item by item, anything else as it is."""
    if isinstance(value, str):
        # Langfuse keeps inputs, outputs and metadata as JSON strings: mask their string values
        # only, so the JSON stays valid and numbers (costs, tokens) stay numbers.
        return mask_json_text(value)
    if isinstance(value, Sequence) and all(isinstance(item, str) for item in value):
        # OpenTelemetry sequences are homogeneous: all strings here.
        return tuple(mask_json_text(item) for item in cast("Sequence[str]", value))
    return value


@dataclass(frozen=True, slots=True)
class Tracing:
    """The Langfuse client and the LangChain handler that feeds it."""

    client: Langfuse
    handler: BaseCallbackHandler

    def shutdown(self) -> None:
        """Send what is buffered and stop the exporter (at app shutdown)."""
        self.client.shutdown()


def create_tracing(settings: Settings, span_exporter: SpanExporter | None = None) -> Tracing | None:
    """The app's tracing, or `None` when the Langfuse keys are not set.

    `span_exporter` replaces the network exporter (tests capture spans in memory with it).
    """
    public_key = settings.langfuse_public_key
    secret_key = settings.langfuse_secret_key
    if public_key is None or secret_key is None:
        return None
    if PLACEHOLDER in (public_key, secret_key.get_secret_value()):
        # `.env.example` copied as it is: tracing with junk keys would only fail and log noise.
        logger.warning("tracing is off: the Langfuse keys are placeholders")
        return None
    client = Langfuse(
        public_key=public_key,
        secret_key=secret_key.get_secret_value(),
        base_url=settings.langfuse_host,
        environment=settings.app_env,
        release=settings.app_version,
        mask_otel_spans=mask_otel_spans,
        span_exporter=span_exporter,
    )
    handler = CallbackHandler(public_key=public_key)
    logger.info("tracing to Langfuse is on")
    return Tracing(client=client, handler=handler)
