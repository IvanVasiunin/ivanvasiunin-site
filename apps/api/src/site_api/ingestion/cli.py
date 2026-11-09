"""Command line entry point: `python -m site_api.ingestion --estimate | --apply`.

Embedding costs money, so the CLI forces a choice, like the evals CLI (CLAUDE.md golden rule 13):
`--estimate` loads, chunks and compares with the database and prints the plan and its cost
without any paid call (it does fetch the allow-listed GitHub READMEs, which is free); `--apply`
also embeds the new texts and writes the changes, then puts every chunk on the 2D map and writes
`points.json` (ROADMAP 6.1, ingestion/points.py). `--refit` (with `--apply`) fits the whole map
again; otherwise new chunks are placed on the existing one, so the map stays put (ADR-0006).
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
from site_api.ingestion.points import PointStore, export_points, update_points
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
        "--refit",
        action="store_true",
        help="with --apply: fit the whole 2D map again instead of placing new chunks on it",
    )
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


def run_map(store: PointStore, settings: Settings, root: Path, refit: bool) -> str:
    """Put every chunk on the 2D map and write `points.json`; returns the report. No paid call."""
    update = update_points(store, settings, root, refit)
    if update.refitted:
        done = f"fitted anew for all {update.total} chunks"
    elif update.placed:
        done = (
            f"{update.placed} new chunks placed, {update.total - update.placed} kept their points"
        )
    else:
        done = f"all {update.total} chunks already placed"
    path, count, size = export_points(store, settings, root)
    return f"Map: {done}.\npoints.json: {count} points, {size / 1024:.1f} KB gzipped, {path}."


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments, run against the configured database and return the exit code.

    A `ValueError` (no repository root, a README that cannot be fetched, no API key, a size
    mismatch, duplicate ids) is a usage problem: it is printed as one line and the exit code
    is 1, without a traceback.
    """
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.refit and not args.apply:
        parser.error("--refit needs --apply")
    settings = Settings()  # pyright: ignore[reportCallIssue] (fields come from the environment)
    try:
        root: Path = args.root or find_repo_root(Path.cwd())
        with create_github_client(settings) as client:
            readmes = load_github_readmes(settings.github_readmes, client)
        docs = [*load_all(root), *readmes]
        engine = create_engine(settings.database_url.get_secret_value())
        try:
            store = PostgresChunkStore(engine)
            # Printed before the map step: a paid sync is reported even if the map then fails.
            print(run(args.apply, docs, settings, store, create_embeddings))
            if args.apply:
                print(run_map(store, settings, root, args.refit))
        finally:
            engine.dispose()
    except ValueError as error:
        print(f"ingestion: {error}", file=sys.stderr)
        return 1
    return 0
