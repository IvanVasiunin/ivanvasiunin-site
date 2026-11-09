"""Time and money of one request: per-step durations and estimated costs (SPEC §4.2 `usage`).

Every node records how long it took and, if it called a model, its tokens; the `usage` event at
the end sums them. Costs come from the price table in config (ADR-0001), and each one is also
added to the day's spend, which the daily budget checks (services/limits.py).
"""

import math
import time
from collections.abc import Sequence

from langchain_core.messages import BaseMessage

from site_api.core.config import ModelPrice
from site_api.graph.generate import TokenUsage
from site_api.schemas.chat import NodeUsage

# English text averages about 4 characters per token; 3 overestimates on purpose, for the cost of
# answers that end before the provider reports their tokens.
CAUTIOUS_CHARS_PER_TOKEN = 3


def ms_since(started: float) -> int:
    """Whole milliseconds since a `time.perf_counter()` reading."""
    return round((time.perf_counter() - started) * 1000)


def estimate_cost_usd(price: ModelPrice, usage: TokenUsage) -> float:
    """One model call's cost in USD: fresh input, cached input and output at their prices."""
    # Cached tokens are part of `input_tokens` (TokenUsage), so they are taken out of fresh input.
    fresh_input = max(usage.input_tokens - usage.cached_input_tokens, 0)
    cost = (
        fresh_input * price.input
        + usage.cached_input_tokens * price.cached_input
        + usage.output_tokens * price.output
    ) / 1_000_000
    return round(cost, 6)


def cautious_cost_usd(
    price: ModelPrice, messages: Sequence[BaseMessage], max_output_tokens: int
) -> float:
    """What an unfinished answer may have cost at most, roughly: all input, full output."""
    prompt_chars = sum(len(message.text) for message in messages)
    usage = TokenUsage(
        input_tokens=math.ceil(prompt_chars / CAUTIOUS_CHARS_PER_TOKEN),
        cached_input_tokens=0,
        output_tokens=max_output_tokens,
    )
    return estimate_cost_usd(price, usage)


def model_node(name: str, started: float, model: str, usage: TokenUsage) -> NodeUsage:
    """The `usage` line of a step that called a model: its time, model name and tokens."""
    return NodeUsage(
        name=name,
        ms=ms_since(started),
        model=model,
        input_tokens=usage.input_tokens,
        cached_input_tokens=usage.cached_input_tokens,
        output_tokens=usage.output_tokens,
    )
