"""Command line entry point: `python -m site_api.ingestion --estimate | --apply`.

Embedding costs money, so the CLI forces a choice, like the evals CLI (CLAUDE.md golden rule 13):
`--estimate` loads, chunks and compares with the database and prints the plan and its cost
without any paid call (it does fetch the allow-listed GitHub READMEs, which is free); `--apply`
also embeds the new texts and writes the changes. The 2D projection and `points.json` join in
ROADMAP 6.1.
"""

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from sqlalchemy import create_engine

from site_api.core.config import Settings
from site_api.ingestion.chunking import chunk_documents
from site_api.ingestion.embeddings import create_embeddings
from site_api.ingestion.github import create_github_client, load_github_readmes
from site_api.ingestion.sources import load_all
from site_api.ingestion.store import ChunkStore, PostgresChunkStore
from site_api.ingestion.sync import SyncPlan, apply_sync, plan_sync


def build_parser() -> argparse.ArgumentParser:
    """Build the parser; `--estimate` and `--apply` are mutually exclusive and one is required."""
    parser = argparse.ArgumentParser(
        prog="python -m site_api.ingestion",
        description="Load, chunk and embed the knowledge base. Embedding costs money.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--estimate", action="store_true", help="print the plan and cost, no calls")
    mode.add_argument("--apply", action="store_true", help="embed new texts and write (paid)")
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="repository root with SPEC.md (default: found by walking up from here)",
    )
    return parser


def find_repo_root(start: Path) -> Path:
    """The nearest folder at or above `start` that holds SPEC.md (the ingestion sources' root)."""
    for folder in [start.resolve(), *start.resolve().parents]:
        if (folder / "SPEC.md").is_file():
            return folder
    raise ValueError(f"No SPEC.md at or above {start}: pass --root")


def describe(plan: SyncPlan, settings: Settings) -> str:
    """A short human summary of the plan, with the embedding cost estimate."""
    tokens = plan.estimated_tokens()
    cost = tokens / 1_000_000 * settings.embedding_price_per_1m_tokens
    return (
        f"Chunks: {plan.unchanged} unchanged, {len(plan.upserts)} to write, "
        f"{len(plan.delete_ids)} to delete.\n"
        f"Embeddings: {len(plan.reused)} reused, {len(plan.to_embed)} to compute "
        f"(~{tokens} tokens, ~${cost:.4f} with {settings.embedding_model})."
    )


def run(
    apply: bool,
    docs: Sequence[Document],
    settings: Settings,
    store: ChunkStore,
    make_embeddings: Callable[[Settings], Embeddings],
) -> str:
    """Plan the sync for these loaded documents, apply it when asked, return the report."""
    chunks = chunk_documents(list(docs), settings.chunk_size, settings.chunk_overlap)
    plan = plan_sync(chunks, store)
    report = describe(plan, settings)
    if not apply:
        return f"{report}\nEstimate only: nothing was embedded or written."
    if not plan.has_changes:
        return f"{report}\nAlready up to date."
    # Created only here: an estimate never needs (or touches) the API key.
    apply_sync(plan, store, make_embeddings(settings), settings.embedding_dimensions)
    return f"{report}\nApplied."


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments, run against the configured database and return the exit code.

    A `ValueError` (no repository root, a README that cannot be fetched, no API key, a size
    mismatch, duplicate ids) is a usage problem: it is printed as one line and the exit code
    is 1, without a traceback.
    """
    args = build_parser().parse_args(argv)
    settings = Settings()  # pyright: ignore[reportCallIssue] (fields come from the environment)
    try:
        root: Path = args.root or find_repo_root(Path.cwd())
        with create_github_client(settings) as client:
            readmes = load_github_readmes(settings.github_readmes, client)
        docs = [*load_all(root), *readmes]
        engine = create_engine(settings.database_url.get_secret_value())
        try:
            store = PostgresChunkStore(engine)
            report = run(args.apply, docs, settings, store, create_embeddings)
        finally:
            engine.dispose()
    except ValueError as error:
        print(f"ingestion: {error}", file=sys.stderr)
        return 1
    print(report)
    return 0
