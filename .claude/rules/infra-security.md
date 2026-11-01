---
paths:
  - "infra/**"
  - "**/Dockerfile"
  - "**/.dockerignore"
  - ".github/**"
  - ".env.example"
  - "lefthook.yml"
  - ".gitleaks.toml"
---

# Docker, infrastructure, security

Verification tags: `[lint]`, `[hook]`, `[test]`, `[settings]`, `[review]`.

## Docker
- **Multi-stage builds.** The runtime stage contains no build tools, sources not needed at runtime, or `.git`. `[review]`
- **Non-root user** in every runtime image (`USER` with a fixed UID). `[review]` `[test]` (CI checks `docker inspect` user)
- **Pinned base images:** exact tags (`python:3.13-slim-bookworm`, `node:24-…`, `pgvector/pgvector:0.8.7-pg18-trixie`, `caddy:2.11-alpine`). Never `latest`. `[review]`
- A `HEALTHCHECK` (or Compose `healthcheck`) for `api`, `db` and `web`. `[review]`
- `.dockerignore` excludes `.env*`, `data/raw/`, `.venv`, `node_modules` and test artifacts. `[review]`
- The `api` image copies the ingestion sources (`data/*.md`, `SPEC.md`, `docs/ARCHITECTURE.md`, `docs/adr/`, `apps/web/src/content/cv/`), never `data/raw/`. `[test]` (CI asserts that no phone pattern or `data/raw` file is in the image)

## Compose and Caddy
- Services: `web` (Caddy with the static build), `api`, `db`.
  - `db` has no published ports.
  - Only Caddy publishes 80 / 443.

  `[review]`
- **Caddy:**
  - automatic HTTPS;
  - `/api/chat` reverse-proxied with `flush_interval -1` (no SSE buffering);
  - zstd / gzip compression;
  - long `Cache-Control: immutable` for hashed assets, short caching for HTML and `/data/points.json`.

  `[review]`
- **Security headers:**
  - CSP without `unsafe-inline` for scripts (hashes where needed), `frame-ancestors 'none'`;
  - HSTS;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `X-Content-Type-Options: nosniff`;
  - a restrictive `Permissions-Policy`.

  `[test]` (an e2e / curl check of the response headers)

## Secrets
- `.env` is never committed. `.env.example` contains only placeholders:
  - `OPENAI_API_KEY`;
  - `# ANTHROPIC_API_KEY` (commented out);
  - `LANGFUSE_*`;
  - `DATABASE_URL`;
  - `CONTEXT7_API_KEY`.

  `[hook]` (gitleaks in pre-commit; PreToolUse hook blocks writes to `.env*` except `.env.example`) `[settings]` (deny `Read(.env*)`)
- On the server, `.env` has permissions `600`. In CI, secrets come from GitHub Secrets only. `[review]`
- Never print secrets in CI logs or Docker build args. `[review]`

## CI
- GitHub Actions jobs:
  - lint;
  - typecheck;
  - test, with `mentor_pending` excluded from the failing step and listed in a separate non-blocking step;
  - build;
  - `pnpm audit` / `pip-audit`;
  - gitleaks.

  `[test]`
- Third-party actions are pinned to a commit SHA. Workflows use minimal `permissions:`. `[review]`
- Images are pushed to GHCR only from `main`. `[review]`

## VPS
- The hardening checklist in `docs/RUNBOOK.md` (SSH keys only, firewall, unattended upgrades, fail2ban) is executed in Phase 8. It is not automated now. `[review]`

## Privacy and AI disclosure
- If question texts are stored or traced, the privacy notice (`/privacy`) describes it. The AI-assistant disclosure is visible next to the chat. `[review]`
