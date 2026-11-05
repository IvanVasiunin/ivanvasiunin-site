# Runbook

- **Status:** Skeleton. Sections are filled in during Phases 1, 3 and 8.

## 1. Deployment

> Files and local checks: ROADMAP 1.6 ([`infra/README.md`](../infra/README.md)). Server setup and the GHCR deploy job: ROADMAP 1.7.

- **Prerequisites:**
  - VPS with Docker Engine + Compose plugin;
  - DNS A / AAAA records;
  - GHCR read token on the server.
- **Server layout:**
  - `/opt/site/` holds `docker-compose.yml` and `.env` (from `infra/.env.example`; permissions `600`, owner = deploy user). The `Caddyfile` is baked into the `web` image;
  - in `.env`: `SITE_ADDRESS` (the domain), `POSTGRES_PASSWORD` (letters and digits only, `openssl rand -hex 32`: it is part of the database URL), `WEB_IMAGE` / `API_IMAGE` (GHCR names), `IMAGE_TAG` (release = git SHA);
  - volumes: `pgdata`, `caddy_data`, `caddy_config`.
- **Deploy:**
  1. set `IMAGE_TAG` in `.env` to the new release;
  2. `docker compose pull`;
  3. `docker compose up -d --wait` (waits for the health checks);
  4. `node scripts/check-headers.mjs https://<domain>` from a checkout, or `curl -fsS https://<domain>/api/health`.
- **Rollback:** set `IMAGE_TAG` back to the previous release, then `docker compose up -d --wait`. `infra/deploy.sh` does this automatically when a new release does not become healthy.

- **Migrations:** `infra/deploy.sh` runs `docker compose run --rm api python -m site_api.db.migrate` after the pull and before starting the new release (a failure stops the deploy with nothing changed). By hand: the same command. Migrations must stay backward-compatible with the previous release (add first, remove in a later release): an automatic rollback switches images, not the schema.
- **Local database (development):** `docker compose -f infra/docker-compose.dev.yml up -d --wait` starts Postgres + pgvector on `127.0.0.1:5432` with the databases `site` (the dev API: `DATABASE_URL` in `.env`) and `site_test` (migration tests), and a read-only role `mcp_reader` for Postgres MCP. Then `uv run --directory apps/api alembic upgrade head`. Never used on the VPS. Use development-only passwords in the local `infra/.env` (`POSTGRES_PASSWORD`, `POSTGRES_MCP_PASSWORD`), never the production one.
- **Postgres MCP (development):** set `POSTGRES_MCP_DATABASE_URI=postgresql://mcp_reader:<POSTGRES_MCP_PASSWORD>@127.0.0.1:5432/site` in your user environment (not in a file in the repository) and restart Claude Code. Never point it at production.
- **Ingestion:** `docker compose run --rm api python -m site_api.ingestion --estimate` prints the plan and the embedding cost; `--apply` embeds and writes. Add `--refit` only for a deliberate full UMAP refit ([ADR-0006](adr/0006-2d-projection.md)).
- **`APP_ENV`:** Compose sets `APP_ENV=production` itself. Never copy the development `.env` to the server.

### 1.1 Automatic deploys (ROADMAP 1.7)

`.github/workflows/deploy.yml` runs after CI passes on `main`:
1. it builds both images and pushes them to GHCR, tagged with the commit SHA;
2. it runs `/opt/site/deploy.sh <sha>` on the server over SSH;
3. it checks the live site with `scripts/check-headers.mjs`.

It uses no third-party actions.

**One-time server setup** (after the Phase 8 hardening checklist, §3):
1. **Deploy user.** Create a user `deploy` with a real login shell (a forced command runs through it; `nologin` would break it) in the `docker` group. Then create `/opt/site` (owner `deploy`, mode `750`).
2. **Files.**
   - Copy `infra/docker-compose.yml` to `/opt/site/`.
   - Copy `infra/deploy.sh` there as **root-owned, mode `755`**: the `deploy` user (and the CI key) must not be able to change what the key may run.
3. **`.env`.** Create `/opt/site/.env` from `infra/.env.example`, owned by `deploy`, then `chmod 600 .env`. Set:
   - `SITE_ADDRESS`;
   - `POSTGRES_PASSWORD` (`openssl rand -hex 32`);
   - `WEB_IMAGE=ghcr.io/<owner>/ivanvasiunin-site-web`;
   - `API_IMAGE=ghcr.io/<owner>/ivanvasiunin-site-api`.
4. **GHCR access.** Simplest: after the first push, set both packages to **public**; then no login is needed.
   - Otherwise, as `deploy`, run `docker login ghcr.io` with a token that can read packages.
   - GitHub documents a classic personal access token with `read:packages` for the container registry. Fine-grained token support is UNVERIFIED: check the current docs.
   - The token is stored in `~deploy/.docker/config.json`; keep that file at mode `600`.
5. **Deploy key.**
   - Generate a dedicated key: `ssh-keygen -t ed25519 -f deploy_key -C github-deploy`.
   - Add its public part to `/home/deploy/.ssh/authorized_keys`, restricted to the deploy script:
     `restrict,command="/opt/site/deploy.sh" ssh-ed25519 AAAA… github-deploy`
   - The key can then run nothing else, not even a shell.
   - The tag arrives in `SSH_ORIGINAL_COMMAND`. The script accepts only a 40-character SHA (tested in `scripts/deploy-script.test.mjs`) and holds a lock, so only one deploy runs at a time.

**GitHub** (Settings → Environments → `production`):
- **Deployment branches:** `main` only.
- **Secrets:**
  - `DEPLOY_SSH_KEY`: the private key;
  - `DEPLOY_TARGET`: `deploy@<host>`;
  - `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 <host>`, checked against the server's fingerprint.
- **Variable:** `SITE_URL`, e.g. `https://ivanvasiunin.com`.
- **Optional:** required reviewers, to approve every deploy by hand.

**First deploy, in order:**
1. Point the DNS records at the server and open ports 80 / 443.
2. Do the server setup above, without `IMAGE_TAG`.
3. Push to `main`. The workflow builds, scans and pushes the images.
4. If the packages stay private, make sure step 4 (GHCR access) is done.
5. The workflow deploys. The smoke test retries for a minute while Caddy obtains the certificate.

**What the workflow guarantees:**
- Only a successful CI run of a push to `main`, or a manual run from `main`, deploys.
- An older commit whose CI finished late never overwrites a newer one.
- The pushed images are the ones scanned for phone numbers and secrets (`infra/scan-images.sh`).

**When `infra/docker-compose.yml` or `infra/deploy.sh` changes,** copy the new file to `/opt/site/` before the deploy. The deploy key cannot copy files, on purpose.

## 2. Backups

> To be filled in Phase 8 (task 8.3).

- **Schedule:** daily `pg_dump -Fc` from the `db` container via a host cron or systemd timer.
- **Retention:** 7 daily + 4 weekly copies, stored off-server (destination to be decided).
- **Also back up** the fitted UMAP model artifact and the last `points.json`.
- **Restore drill:**
  1. restore into a fresh container;
  2. run `alembic current`;
  3. run a retrieval smoke test.

## 3. VPS hardening checklist

> Execute in Phase 8 (task 8.2), not now.

- [ ] Non-root deploy user with sudo; SSH login by **key only** (`PasswordAuthentication no`, `PermitRootLogin no`)
- [ ] Firewall (ufw / nftables): allow 22 (or a custom SSH port), 80, 443 only
- [ ] Automatic security updates (`unattended-upgrades`)
- [ ] fail2ban for SSH
- [ ] Docker daemon not exposed on TCP; the DB has no published ports
- [ ] `.env` permissions `600`; no secrets in images or the compose file
- [ ] Time sync (chrony / systemd-timesyncd)
- [ ] Disk usage and log rotation for Docker logs

## 4. Key rotation

> To be filled in Phase 8 (task 8.4).

| Secret | Where it lives | Rotation steps |
|---|---|---|
| `OPENAI_API_KEY` | Server `.env`; GitHub Secret (evals only) | Create a new key in the OpenAI project → update `.env` and the GitHub Secret → `docker compose up -d api` → revoke the old key |
| `ANTHROPIC_API_KEY` (optional) | Same | Same procedure |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Server `.env` | Rotate in Langfuse project settings → update `.env` → restart `api` |
| Postgres password | Server `.env` | `ALTER ROLE … PASSWORD …` → update `.env` → restart `api` |
| GHCR token | Server docker login | Regenerate → `docker login ghcr.io` |

## 5. Spend controls

- **OpenAI:** a hard project spend limit. When it is hit, requests fail with 429 `project_spend_limit_exceeded`, and the chat shows `budget_exceeded`.
- **Langfuse Hobby:** usage alerts (if available).
- The `usage` totals in chat statistics are checked monthly.

## 6. Incidents

> To be filled as needed.

| Symptom | First checks |
|---|---|
| Chat returns `upstream_unavailable` | OpenAI status page; API logs; spend limit |
| SSE stalls behind the proxy | Caddy `flush_interval -1` on `/api/chat`; response headers |
| `/api/health` 503 | `docker compose ps`; db container logs; disk space |
