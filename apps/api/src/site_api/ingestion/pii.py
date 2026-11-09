"""Remove phone numbers from text that does not come from this repository (CLAUDE.md rule 5).

The repository's own sources are guarded by gitleaks and tests. Fetched text (GitHub READMEs) is
not, and NumbersValidator is a phone-number tool whose README could one day show an example
number, so fetched text goes through `redact_phone_numbers` before it is chunked.
"""

import re

# 9+ digits with at most two separators between them: a phone number, not a date or a version.
# The same pattern as the repository-wide no-phone tests.
PHONE_PATTERN = re.compile(r"\+?\d(?:[ ()-]{0,2}\d){8,}")
PHONE_PLACEHOLDER = "[phone number removed]"


def redact_phone_numbers(text: str) -> tuple[str, int]:
    """Replace every phone-like string; return the new text and how many were replaced."""
    # subn = sub + the number of replacements, so the caller can report them.
    return PHONE_PATTERN.subn(PHONE_PLACEHOLDER, text)
