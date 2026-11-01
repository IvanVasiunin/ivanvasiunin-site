# `infra/`

Deployment files. Empty until [ROADMAP](../docs/ROADMAP.md) task **1.6**, which adds:

- `docker-compose.yml` — services `web` (Caddy with the static build), `api`, `db` (Postgres 18 + pgvector, internal network only);
- `Caddyfile` — automatic HTTPS, SSE without buffering, security headers, compression, immutable caching for hashed assets;
- helper scripts (backups, deploy).

Dockerfiles live next to their apps. Rules: [`.claude/rules/infra-security.md`](../.claude/rules/infra-security.md). Operations: [`docs/RUNBOOK.md`](../docs/RUNBOOK.md).
