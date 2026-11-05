"""Create `chat_answers`: one row per answer, for the chat statistics (SPEC §6.6, ROADMAP 4.6).

What is kept: when, the router's class and language, how the answer ended (finish reason or
error code), its estimated cost and duration, and the question with emails, phone numbers and
URLs masked. What is never kept: the visitor's IP address, the session id, the full question
text. Rows older than the retention period (CHAT_STATS_RETENTION_DAYS) are deleted by a scheduled
job (rules/postgres.md, services/stats.py).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the table and the index the retention job and the statistics read by time."""
    op.create_table(
        "chat_answers",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # Null when the request failed before the router decided (fail closed).
        sa.Column("route", sa.Text(), nullable=True),
        sa.Column("language", sa.Text(), nullable=True),
        # Exactly one of the two is set: the answer ended (`done`) or failed (`error`); both are
        # null when the visitor stopped it.
        sa.Column("finish_reason", sa.Text(), nullable=True),
        sa.Column("error_code", sa.Text(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=False, server_default="0"),
        sa.Column("total_ms", sa.Integer(), nullable=True),
        # Masked before it is written (services/masking.py).
        sa.Column("question_masked", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "route IS NULL OR route IN ('about_ivan', 'greeting', 'off_topic', 'injection')",
            name="ck_chat_answers_route",
        ),
        sa.CheckConstraint("cost_usd >= 0", name="ck_chat_answers_cost"),
    )
    op.create_index("ix_chat_answers_created_at", "chat_answers", ["created_at"])


def downgrade() -> None:
    """Drop the table (its index goes with it)."""
    op.drop_table("chat_answers")
