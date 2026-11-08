# Vendored: Impeccable

- **Source:** https://github.com/pbakaus/impeccable, tag `skill-v4.8.0`, commit `414603bf14c7a344edb466bb1f85690c77ce8b7d` (2026-10-26). Path in the source: `.claude/skills/impeccable/`.
- **License:** Apache-2.0 (`LICENSE` in this folder).
- **Engine:** `scripts/VERSION` = `0.1.18`. On first run the launcher downloads the engine binary from the project's GitHub releases into `~/.impeccable/bin/0.1.18/` and runs it only if its SHA-256 matches `scripts/engine-checksums.txt`.
- **Why vendored (ROADMAP 7.2, Ivan's choice 2026-11-08):** a project-only copy instead of `npx impeccable install`, so nothing is written to user-level Claude Code settings (no design hook) and the version is pinned in git.

## Changes from the source

- `SKILL.md`: a "Project overrides" block added after the frontmatter. The rest is unchanged.
- Removed: `reference/overdrive.md` (banned), `reference/live.md`, `reference/live-setup.md`, `reference/generate.md` (live browser mode), `reference/hooks.md` (user-level hook), `scripts/live-browser*.js`, `scripts/modern-screenshot.umd.js` (live mode), `scripts/data/font-index*.json` (font suggestions; the site's fonts are fixed).
- Unchanged: every other `reference/*.md`, `scripts/impeccable`, `scripts/impeccable.cmd`, `scripts/engine-checksums.txt`, `scripts/VERSION`, `scripts/command-metadata.json`.

## Updating

Clone the new `skill-v*` tag, copy the same files, re-apply the changes above, update this file and ADR-0001, and review the diff before committing.
