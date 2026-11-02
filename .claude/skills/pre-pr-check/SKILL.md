---
name: pre-pr-check
description: Runs the full pre-commit / pre-PR verification suite — all linters, typecheckers, unit, component, contract and e2e tests (desktop + mobile), a11y, builds, dependency audits and secret scan. Use before proposing or making any commit.
---

# Pre-PR check

Run everything except evals and long performance runs. Delegate to the **`test-runner`** subagent where the output is long.

| # | Check | Command (see `docs/TESTING.md`) |
|---|---|---|
| 1 | Secrets | `gitleaks git --pre-commit --staged --no-banner --redact`, and `gitleaks git --no-banner --redact .` for the whole history |
| 2 | Fast checks, all apps | `node scripts/check-fast.mjs` |
| 3 | API contract + type staleness | regenerate OpenAPI types; `git diff --exit-code apps/web/src/lib/api/` |
| 4 | Web build (incl. CV PDF) | `pnpm --dir apps/web run build` |
| 5 | E2E + axe + visual, all Playwright projects | `pnpm --dir apps/web run e2e` |
| 6 | Bundle budgets | `pnpm --dir apps/web run budget` |
| 7 | Dependency audits | `pnpm audit --prod --audit-level=high`; pip-audit on the locked export, as in CI (`.github/workflows/ci.yml`, step "pip-audit") |
| 8 | Mentor-pending report (informational) | `uv run --directory apps/api pytest -m mentor_pending --co -q` |
| 9 | Lighthouse CI (if pages changed) | `pnpm --dir apps/web run lhci` |

Commands that do not exist yet (empty skeleton) are reported as "n/a", never as passed.

## Then
- Check the commit message proposal against Conventional Commits.
- Check the diff size: if code is > ~600 lines or markup / styles > ~1200, propose a split.
- Report with the `step-report` **Проверки** table.
- **Do not commit or push** unless Ivan asked for it. Never `--no-verify`.
