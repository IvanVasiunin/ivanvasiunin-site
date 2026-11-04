"""Split a Markdown file into its YAML frontmatter and its body.

Mentor zone (ADR-0007): Ivan writes the implementation (ROADMAP 3.2).
"""


def split_frontmatter(text: str) -> tuple[dict[str, object], str]:
    """Return the frontmatter mapping and the body of a Markdown text."""
    raise NotImplementedError
