#!/bin/sh
# Development only (infra/docker-compose.dev.yml): a read-only role for Postgres MCP (.mcp.json), so
# an AI tool never connects as the superuser `site`. Read-only twice over: it can only read
# (`pg_read_all_data`), and every transaction it opens is read-only by default. MCP's own
# `restricted` mode is a third, application-level layer. The password comes from infra/.env
# (POSTGRES_MCP_PASSWORD) and reaches psql as a variable, never as SQL text in this file.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
	-v password="$POSTGRES_MCP_PASSWORD" <<'SQL'
CREATE ROLE mcp_reader LOGIN PASSWORD :'password';
GRANT pg_read_all_data TO mcp_reader;
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
SQL
