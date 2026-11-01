"""RAG evals: datasets, metrics and the paid eval runner.

Mentor zone (ADR-0007): Ivan writes the eval logic. Only the thin CLI in `cli.py` exists so far,
so that `--estimate` / `--run` are wired into docs and CI before any case is written.
"""
