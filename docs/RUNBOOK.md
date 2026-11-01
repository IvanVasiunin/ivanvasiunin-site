# Runbook

- **Status:** Skeleton. Sections are filled in during Phases 1, 3 and 8.

## 1. Deployment

> To be filled in Phase 1 (task 1.7).

- **Prerequisites:**
  - VPS with Docker Engine + Compose plugin;
  - DNS A / AAAA records;
  - GHCR read token on the server.
- **Server layout:**
  - `/opt/site/` holds `docker-compose.yml`, `Caddyfile` and `.env` (permissions `600`, owner = deploy user);
  - volumes: `pgdata`, `caddy_data`, `caddy_config`.
- **Deploy:**
  1. `docker compose pull`
  2. `docker compose up -d`
  3. check `/api/health`
- **Rollback:** pin the previous image tag in `.env`, then `docker compose up -d`.
- **Migrations:** `docker compose run --rm api alembic upgrade head`, run before starting the new `api`.
- **Ingestion:** `docker compose run --rm api python -m site_api.ingestion`. Add `--refit` only for a deliberate full UMAP refit ([ADR-0006](adr/0006-2d-projection.md)).

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
