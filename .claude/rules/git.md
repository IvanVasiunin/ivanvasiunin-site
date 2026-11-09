# Git

This rule has no `paths:`, so it always loads. Verification tags: `[hook]`, `[settings]`, `[review]`.

- **Conventional Commits:** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`, `build:`, `perf:`, `style:`. Optional scope: `feat(web):`, `fix(api):`. `[hook]` (lefthook `commit-msg` check)
- **Branches:** `feat/…`, `fix/…`, `chore/…`, `docs/…`. Never commit directly to `main` once the remote exists. `[review]`
- **PR size:** one logical change; code (incl. tests) ≤ ~600 changed lines, markup and styles (HTML / Astro markup, SCSS) ≤ ~1200, where possible. `[review]`
- Commit only when Ivan asks. **Push** to `origin` (`github.com/IvanVasiunin/ivanvasiunin-site`) is allowed since 2026-11-09 (Ivan's permission). A push to `main` triggers the deploy workflow, so it asks first. `[settings]` (ask rule for `git push … main`)
- **No force-push, branch deletion on the remote, history rewrite** (`rebase -i`, `commit --amend` on pushed commits, `reset --hard` on shared branches) without Ivan's explicit request. `[settings]` (deny rules for `git push --force` / `-f` / `+refspec` / `--delete` / `--mirror`, `git reset --hard`, `git rebase`)
- **Pre-commit hooks** (lefthook):
  - formatting;
  - linters on staged files;
  - gitleaks on staged changes.

  Hooks are never skipped (`--no-verify` is forbidden). `[hook]` `[settings]` (deny `git commit --no-verify`)
- `data/raw/`, `.env*` (except `.env.example`), `.venv/`, `node_modules/` and build artifacts are git-ignored. `[review]`
