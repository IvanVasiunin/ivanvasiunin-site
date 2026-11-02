# syntax=docker/dockerfile:1
# API image (ROADMAP 1.6, infra-security.md): multi-stage, pinned, non-root, health-checked.
# Build from the repository root: docker build -f apps/api/Dockerfile .

# --- Build: resolve the locked dependencies into a virtualenv -------------------------------
FROM python:3.13.18-slim-bookworm AS build

# uv from its pinned image (the same version as CI), not a curl | sh install.
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /build
# Dependencies first, so source changes do not invalidate this layer.
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# The package itself, installed into the venv (not editable): the runtime needs no sources.
COPY apps/api/src ./src
RUN uv sync --locked --no-dev --no-editable

# --- Runtime: the venv, the system libpq, and nothing else ------------------------------------
FROM python:3.13.18-slim-bookworm AS runtime

# psycopg uses the system libpq (security updates come with the base image / apt), not the
# bundled one of psycopg-binary, which is a development-only dependency.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 site \
    && useradd --system --uid 10001 --gid site --no-create-home --shell /usr/sbin/nologin site

COPY --from=build --chown=root:root /app/.venv /app/.venv

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production

USER 10001:10001
WORKDIR /app
EXPOSE 8000

# Liveness of the API and its database (SPEC §4.5). No curl in the image: Python's urllib.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"]

# --proxy-headers with FORWARDED_ALLOW_IPS (set in Compose to Caddy's network) gives slowapi the
# real client IP from Caddy; no server header; no uvicorn access log (it would log client IPs:
# the app writes its own access line without them, core/request_context.py).
CMD ["uvicorn", "site_api.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--no-server-header", "--no-access-log"]
