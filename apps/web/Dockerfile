# syntax=docker/dockerfile:1
# Web image (ROADMAP 1.6, ARCHITECTURE §1): Caddy serving the static Astro build, with TLS, headers
# and the /api/* proxy (infra/Caddyfile). Multi-stage, pinned, non-root.
# Build from the repository root: docker build -f apps/web/Dockerfile .

# --- Build: the static site -------------------------------------------------------------------
FROM node:24.14.0-bookworm-slim AS build

# pnpm at the exact version from package.json `packageManager`, through Corepack.
# CI=true also stops lefthook's postinstall from touching git hooks.
ENV CI=true \
    ASTRO_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /repo
# Manifests first, so source changes do not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# The build prints the CV PDF in Chromium (apps/web/scripts/build-pdf.mjs, ROADMAP 2.5): the headless
# shell at the version pinned by @playwright/test, with its system libraries. Build stage only; the
# runtime image below copies just dist/. A separate layer, so source changes do not re-download it.
RUN pnpm --dir apps/web exec playwright install --with-deps --only-shell chromium

COPY apps/web apps/web
RUN pnpm --dir apps/web run build

# --- Runtime: Caddy with the build ----------------------------------------------------------
FROM caddy:2.11.7-alpine AS runtime

# Run as a dedicated user; Caddy's state (certificates) lives in /data and /config, owned by it.
# Ports 80 / 443 are bound without any capability: Compose lowers the container's unprivileged port
# start to 0. The official image gives /usr/bin/caddy a file capability (cap_net_bind_service), and
# with no-new-privileges and cap_drop ALL the kernel refuses to exec such a binary ("operation not
# permitted", the first CI run): a plain copy drops the capability.
RUN cp /usr/bin/caddy /usr/bin/caddy.plain \
    && mv /usr/bin/caddy.plain /usr/bin/caddy \
    && chmod 755 /usr/bin/caddy
RUN addgroup -S -g 10002 caddy \
    && adduser -S -D -H -u 10002 -G caddy caddy \
    && mkdir -p /data /config \
    && chown -R caddy:caddy /data /config

COPY --chown=root:root infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=root:root /repo/apps/web/dist /srv

USER caddy
EXPOSE 80 443 443/udp

# Caddy's internal health endpoint (infra/Caddyfile, bound to 127.0.0.1:2020).
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:2020/"]

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
