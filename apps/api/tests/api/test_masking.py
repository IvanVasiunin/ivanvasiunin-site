"""Masking of visitor text before it is stored or traced (SPEC §6.6, ROADMAP 4.6).

The phone numbers below are templates: every "N" becomes "0" at runtime (gitleaks blocks any
phone-shaped literal, even a fake one; scripts/gitleaks-rules.test.mjs does the same).
"""

import json
import time

import pytest

from site_api.services.masking import mask_json_text, mask_text


def _zeros(template: str) -> str:
    """A phone-shaped test string from a template, every "N" a "0"."""
    return template.replace("N", "0")


@pytest.mark.parametrize(
    ("text", "masked"),
    [
        ("Write to jane.doe+cv@example.co.uk please", "Write to [email] please"),
        ("See https://example.com/path?q=1 for more", "See [url] for more"),
        ("or www.example.org", "or [url]"),
        (_zeros("Call +NN NNN NNN NNNN today"), "Call [phone] today"),
        (_zeros("Call (NNN) NNN-NNNN"), "Call [phone]"),
        (_zeros("number NNN.NNN.NNNN"), "number [phone]"),
    ],
)
def test_personal_data_is_replaced_by_placeholders(text: str, masked: str) -> None:
    assert mask_text(text) == masked


@pytest.mark.parametrize(
    "text",
    [
        "Did Ivan work at BrainRocket from 2016-2024?",
        "What did Ivan do in 2021?",
        "Is 3000 euros a month enough?",
        "What is NumbersValidator?",
    ],
)
def test_ordinary_questions_stay_as_they_are(text: str) -> None:
    assert mask_text(text) == text


def test_an_email_inside_a_url_is_masked_as_the_url() -> None:
    assert mask_text("https://example.com/?mail=a@b.co") == "[url]"


@pytest.mark.parametrize(
    ("text", "masked"),
    [
        ("my profile linkedin.com/in/someone-0", "my profile [url]"),
        ("t.me/some_handle please", "[url] please"),
        ("ftp://files.example.com/cv.pdf", "[url]"),
        ("Call +0 000 000\N{EN DASH}00\N{EN DASH}00", "Call [phone]"),
        ("Call 000/000/0000", "Call [phone]"),
        ("Call 000\N{NO-BREAK SPACE}000\N{NO-BREAK SPACE}0000", "Call [phone]"),
        ("o'brien@example.com", "[email]"),
        ("иван@пример.рф", "[email]"),
    ],
)
def test_the_gaps_the_privacy_review_found_are_masked(text: str, masked: str) -> None:
    assert mask_text(text) == masked


def test_a_link_never_swallows_the_quote_or_bracket_after_it() -> None:
    assert mask_text('see "https://example.com/a", (www.example.org)') == 'see "[url]", ([url])'


def test_json_keeps_its_shape_and_its_numbers() -> None:
    # Langfuse's inputs, outputs and usage are JSON strings: only their texts are masked. As
    # plain text, the cost (ten digits) would read as a phone number.
    text = json.dumps(
        {
            "messages": [{"role": "user", "content": "see https://example.com/a or a@b.co"}],
            "cost": 0.123456789,
            "tokens": 1234567890,
        }
    )

    masked = json.loads(mask_json_text(text))

    assert masked["messages"][0]["content"] == "see [url] or [email]"
    assert masked["cost"] == 0.123456789
    assert masked["tokens"] == 1234567890


def test_text_that_is_not_json_is_masked_as_text() -> None:
    assert mask_json_text("write a@b.co") == "write [email]"


def test_masking_a_long_hostile_string_stays_fast() -> None:
    # A hook that hangs would hold up every trace export (catastrophic backtracking).
    hostile = "1 " * 20_000 + "x" + "-" * 20_000
    started = time.perf_counter()

    mask_text(hostile)

    assert time.perf_counter() - started < 1.0
