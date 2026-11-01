# Git

This rule has no `paths:`, so it always loads. Verification tags: `[hook]`, `[settings]`, `[review]`.

- **Conventional Commits:** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`, `build:`, `perf:`, `style:`. Optional scope: `feat(web):`, `fix(api):`. `[hook]` (lefthook `commit-msg` check)
- **Branches:** `feat/…`, `fix/…`, `chore/…`, `docs/…`. Never commit directly to `main` once the remote exists. `[review]`
- **Small PRs:** one logical change, ≤ ~300 changed lines where possible. `[review]`
- Commit only when Ivan asks. **No `git push`, force-push, history rewrite** (`rebase -i`, `commit --amend` on pushed commits, `reset --hard` on shared branches) without Ivan's explicit request. `[settings]` (deny rules for `git push`, `git push --force`, `git reset --hard`, `git rebase`)
- **Pre-commit hooks** (lefthook):
  - formatting;
  - linters on staged files;
  - gitleaks on staged changes.

  Hooks are never skipped (`--no-verify` is forbidden). `[hook]` `[settings]` (deny `git commit --no-verify`)
- `data/raw/`, `.env*` (except `.env.example`), `.venv/`, `node_modules/` and build artifacts are git-ignored. `[review]`
