"""Masking of visitor text before it is stored or traced (SPEC §6.6, ROADMAP 4.6).

A question can contain someone's email, phone number or a link. The chat statistics and the
Langfuse traces keep the question only after these are replaced by placeholders. Masking is
deliberately greedy (a false positive costs a word of an anonymous statistic, a false negative
leaks personal data) and best effort: names, addresses or handles have no pattern to find, which
the privacy notice says.
"""

import json
import re
from typing import cast

# user@example.com, first.last+tag@sub.example.co.uk, o'brien@example.org, иван@пример.рф
_EMAIL = re.compile(r"[\w.+'-]+@[\w-]+(?:\.[\w-]+)+")
# Characters that end a link inside text or JSON: whitespace, quotes, brackets.
_URL_TAIL = r"""[^\s"'<>()\[\]{}]+"""
# Any scheme (https://, ftp://, …), www.…, or a bare domain with a path (linkedin.com/in/x).
_URL = re.compile(
    rf"\b[a-z][a-z0-9+.-]*://{_URL_TAIL}|\bwww\.{_URL_TAIL}|\b(?:[\w-]+\.)+[a-z]{{2,}}/(?:{_URL_TAIL})?",
    re.IGNORECASE,
)
# A phone number: an optional +, then at least 9 digits, which may be separated by up to three
# characters each: whitespace (also no-break), dots, dashes (also en and em), slashes, brackets.
# Nine digits keep years and ranges ("2016-2024", 8 digits) unmasked.
_PHONE_SEPARATORS = r"\s().\-/" + chr(0x00A0) + chr(0x2013) + chr(0x2014)
_PHONE = re.compile(rf"\+?\(?\d(?:[{_PHONE_SEPARATORS}]{{0,3}}\d){{8,}}")

EMAIL_PLACEHOLDER = "[email]"
URL_PLACEHOLDER = "[url]"
PHONE_PLACEHOLDER = "[phone]"


def mask_text(text: str) -> str:
    """The text with emails, URLs and phone numbers replaced by placeholders."""
    # Order matters: URLs and emails first, so their digits never read as a phone number.
    masked = _URL.sub(URL_PLACEHOLDER, text)
    masked = _EMAIL.sub(EMAIL_PLACEHOLDER, masked)
    return _PHONE.sub(PHONE_PLACEHOLDER, masked)


def mask_json_text(text: str) -> str:
    """Mask a string that may hold JSON: only its string values, so the JSON stays valid.

    Langfuse stores inputs, outputs and metadata as JSON strings; masking them as plain text
    would cut a link's closing quote or turn a long decimal cost into a "phone number".
    Text that is not JSON is masked as text.
    """
    try:
        data: object = json.loads(text)
    except ValueError:
        return mask_text(text)
    return json.dumps(_mask_strings(data), ensure_ascii=False)


def _mask_strings(value: object) -> object:
    """Every string inside `value` masked; numbers, booleans and keys untouched."""
    if isinstance(value, str):
        return mask_text(value)
    if isinstance(value, list):
        return [_mask_strings(item) for item in cast("list[object]", value)]
    if isinstance(value, dict):
        return {key: _mask_strings(item) for key, item in cast("dict[str, object]", value).items()}
    return value
