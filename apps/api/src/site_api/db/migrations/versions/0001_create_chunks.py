"""Create the `chunks` table: the RAG knowledge base (ADR-0003, ROADMAP 3.1).

One row per chunk of a source document, with its embedding, its metadata for filters and the
"Under the hood" panel, a full-text vector for hybrid search and its 2D map coordinates.

Revision ID: 0001
Revises:
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# text-embedding-3-large at 1536 dimensions (ADR-0001). Changing it needs a migration and a reindex.
EMBEDDING_DIMENSIONS = 1536


def upgrade() -> None:
    """Create the pgvector extension, the `chunks` table and its indexes."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "chunks",
        # Stable chunk id, also the point id in points.json (SPEC §4), e.g. `cv:brainrocket:3`.
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        # A row is written once its embedding exists, so it is never empty.
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        # From the source's frontmatter; the personal-facts rule filters on it (SPEC §5).
        sa.Column("category", sa.Text(), nullable=False),
        # The heading the chunk belongs to (e.g. a job); also the label of its point on the map.
        sa.Column("section", sa.Text(), nullable=False),
        # Groups chunks of one project for per-project deduplication in retrieval (ROADMAP 3.6).
        sa.Column("project", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("source_date", sa.Date(), nullable=True),
        # sha256 of the content: re-ingesting an unchanged chunk makes no embedding call (3.4).
        sa.Column("content_hash", sa.Text(), nullable=False),
        # 2D map coordinates in 0..1, filled by the projection step (6.1); empty until then.
        # `REAL[float]` tells the type checker which Python type the column holds; SQL is `REAL`.
        sa.Column("x", sa.REAL[float](), nullable=True),
        sa.Column("y", sa.REAL[float](), nullable=True),
        # Full-text search for hybrid retrieval: the section name weighs more than the body. The
        # corpus is English; questions in other languages are matched by the vector search.
        sa.Column(
            "tsv",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('english', section), 'A') || "
                "setweight(to_tsvector('english', content), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        # `updated_at` is set by the ingestion upsert (no trigger: the one writer sets it).
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_chunks"),
        # The source types of SPEC §4 (the `sources` event and points.json use the same values).
        sa.CheckConstraint(
            "source_type IN ('cv', 'experience', 'personal', 'site_docs', 'github_readme')",
            name="ck_chunks_source_type",
        ),
        sa.CheckConstraint("content_hash ~ '^[0-9a-f]{64}$'", name="ck_chunks_content_hash_sha256"),
        sa.CheckConstraint("x IS NULL OR (x >= 0 AND x <= 1)", name="ck_chunks_x_range"),
        sa.CheckConstraint("y IS NULL OR (y >= 0 AND y <= 1)", name="ck_chunks_y_range"),
        # A point has both coordinates or none.
        sa.CheckConstraint("(x IS NULL) = (y IS NULL)", name="ck_chunks_xy_together"),
    )
    # Cosine distance, the metric of OpenAI embeddings. At a few hundred rows a scan would do; the
    # index is part of the demonstrated design (ADR-0003).
    op.create_index(
        "ix_chunks_embedding_hnsw",
        "chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.create_index("ix_chunks_tsv", "chunks", ["tsv"], postgresql_using="gin")
    op.create_index("ix_chunks_source_type", "chunks", ["source_type"])


def downgrade() -> None:
    """Drop the table (its indexes go with it) and the extension.

    For development and the migration tests: deploys never downgrade (infra/deploy.sh), because a
    downgrade deletes the knowledge base. Without CASCADE, dropping the extension fails if anything
    else still uses the `vector` type, which is the safe outcome.
    """
    op.drop_table("chunks")
    op.execute("DROP EXTENSION IF EXISTS vector")
