"""Allow the `rude` router class in `chat_answers` (SPEC §5.1, 2026-11-08).

The check constraint lists the router's classes, so a new class needs a new constraint: drop the
old one and create it again with `rude`. The downgrade counts rude answers as off-topic (the
closest old class) before it restores the old list, so it never fails on existing rows.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NAME = "ck_chat_answers_route"
_OLD = "route IS NULL OR route IN ('about_ivan', 'greeting', 'off_topic', 'injection')"
_NEW = "route IS NULL OR route IN ('about_ivan', 'greeting', 'off_topic', 'injection', 'rude')"


def upgrade() -> None:
    """Replace the route constraint with one that includes `rude`."""
    op.drop_constraint(_NAME, "chat_answers", type_="check")
    op.create_check_constraint(_NAME, "chat_answers", _NEW)


def downgrade() -> None:
    """Count rude answers as off-topic, then restore the old list of classes."""
    op.execute("UPDATE chat_answers SET route = 'off_topic' WHERE route = 'rude'")
    op.drop_constraint(_NAME, "chat_answers", type_="check")
    op.create_check_constraint(_NAME, "chat_answers", _OLD)
