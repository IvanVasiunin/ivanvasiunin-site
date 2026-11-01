---
paths:
  - "apps/api/**/*.py"
  - "apps/api/pyproject.toml"
---

# Python

Verification tags: `[lint]` ruff / pyright, `[hook]` Claude Code hook, `[test]`, `[review]`.

## Environment
- Python **3.13**, pinned in `apps/api/.python-version`. The virtualenv is `apps/api/.venv`, created by uv. `[review]`
- Dependencies are added only via `uv add` / `uv add --dev`. `uv.lock` is committed. No `pip install`, no `requirements.txt`. `[review]`
- `pyproject.toml` is the single source of configuration (ruff, pyright, pytest, coverage). No `setup.cfg`, `pytest.ini`, `.flake8` or `mypy.ini`. `[review]`
- Commands run through `uv run …` from `apps/api`. `[review]`

## Types and lint
- Type annotations everywhere: function parameters, return types, module-level constants, class attributes. `[lint]` (ruff `ANN` rules; pyright `strict`)
- **pyright strict** passes with no errors. `# type: ignore` / `# pyright: ignore` only with a specific rule code and a reason comment. `[lint]` (`reportUnnecessaryTypeIgnoreComment`; ruff `PGH003`)
- `Any` is avoided; when unavoidable (untyped library boundaries), it is wrapped and narrowed immediately. `[lint]` (ruff `ANN401`) `[review]`
- **ruff** handles lint and format. The hook formats and fixes every edited `.py` file. `[lint]` `[hook]`
- Rule sets:
  - `E`, `F`, `W`, `I` (isort), `B`, `UP`, `ANN`, `S` (bandit), `SIM`, `RUF`, `PTH`, `DTZ`, `ASYNC`, `PL` (selected), `D` (docstrings, Google style, public API only);
  - line length 100.

  `[lint]`

## Readability (Ivan is learning Python)
- Explicit is better than clever:
  - no nested comprehensions with conditions;
  - no `lambda` longer than one expression;
  - no metaprogramming or monkeypatching outside tests.

  `[review]`
- Every module and public function has a docstring that explains **why** it exists, not only what it does. `[lint]` (ruff `D100`–`D103`) `[review]`
- Non-obvious library calls (LangChain, LangGraph, pgvector, UMAP) get a short comment saying what the call does and why its parameters are set the way they are. `[review]`
- Small functions: one responsibility; ≤ ~40 lines. `[lint]` (ruff `PLR0915`, `C901` max complexity 10) `[review]`
- Use `pathlib`, not `os.path`. Use timezone-aware datetimes. `[lint]` (`PTH`, `DTZ`)

## Configuration and secrets
- Configuration only via **pydantic-settings** (`core/config.py`), loaded from environment / `.env`. No `os.environ[...]` / `os.getenv` elsewhere. `[lint]` (ruff `TID251` banned-api for `os.getenv`, `os.environ`) `[review]`
- No secrets, keys or tokens in code, tests or fixtures. API keys are `SecretStr`. `[lint]` (ruff `S105`, `S106`) `[hook]` (gitleaks; PreToolUse block on `.env*`)
- Model IDs, prices, temperatures, token limits, thresholds and rate limits are config values, never literals in logic. `[review]`

## Mentor zone
- In `ingestion/`, `rag/`, `graph/`, `prompts/` and `evals/`, mentor mode applies: Claude does **not** write the implementation unless Ivan explicitly asks. See `mentor-mode.md`. `[review]`
