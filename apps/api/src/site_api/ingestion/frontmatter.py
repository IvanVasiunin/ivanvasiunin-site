"""Split a Markdown file into its YAML frontmatter and its body.

The CV collection and `data/*.md` keep their structured fields (title, category, dates) in a
YAML block between two `---` lines at the top of the file. Every loader needs that split.
"""

import re
from typing import cast

import yaml

# `---` on the first line, the YAML, then a closing `---` line or the end of the text.
# DOTALL lets `.` match newlines; the lazy `.*?` stops at the FIRST closing `---`.
_FRONTMATTER = re.compile(r"\A---\n(.*?)\n---[ \t]*(?:\n|\Z)", re.DOTALL)


def split_frontmatter(text: str) -> tuple[dict[str, object], str]:
    """Return the frontmatter mapping and the body of a Markdown text.

    A text that does not start with a `---` line has no frontmatter: the result is `({}, text)`.

    Raises:
        ValueError: the frontmatter is not closed or is not a YAML mapping.
    """
    if not text.startswith("---\n"):
        return {}, text
    match = _FRONTMATTER.match(text)
    if match is None:
        raise ValueError("Unclosed frontmatter: no closing '---' line")
    # safe_load builds only plain data (dict, list, str, int, date), never arbitrary objects.
    data = yaml.safe_load(match.group(1))
    if not isinstance(data, dict):
        raise ValueError("Frontmatter must be a YAML mapping")
    body = text[match.end() :].lstrip("\n")
    return cast("dict[str, object]", data), body
