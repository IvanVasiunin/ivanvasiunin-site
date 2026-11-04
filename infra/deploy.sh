#!/bin/sh
# Server-side deploy (ROADMAP 1.7, docs/RUNBOOK.md §1.1): switch the stack to an image tag, wait for
# the health checks, roll back automatically if the new release does not become healthy.
#
# Lives at /opt/site/deploy.sh, owned by root, mode 755 (the deploy user must not be able to edit it).
# The CI deploy key may run only this script: its authorized_keys entry is
# `restrict,command="/opt/site/deploy.sh" ssh-ed25519 …`, and the tag arrives in SSH_ORIGINAL_COMMAND.
# By hand: `/opt/site/deploy.sh <git sha>`.
set -eu

cd "$(dirname "$0")"

# One deploy at a time (a manual run and a CI run must not interleave).
exec 9>.deploy.lock
if ! flock -n 9; then
	echo "deploy: another deploy is running" >&2
	exit 3
fi

# A release tag is a full git SHA: exactly 40 lowercase hex characters. `case` checks the whole
# string, so a newline or any other character makes it invalid (grep would check line by line).
is_sha() {
	case "$1" in
	'' | *[!0-9a-f]*) return 1 ;;
	esac
	[ "${#1}" -eq 40 ]
}

tag="${1:-${SSH_ORIGINAL_COMMAND:-}}"
if ! is_sha "$tag"; then
	echo "deploy: expected a 40-character git SHA" >&2
	exit 2
fi

previous="$(sed -n 's/^IMAGE_TAG=//p' .env | tail -n 1)"
if [ -n "$previous" ] && ! is_sha "$previous"; then
	echo "deploy: ignoring an invalid IMAGE_TAG in .env" >&2
	previous=""
fi

# Records the running release in .env, only after it is healthy.
set_tag() {
	if grep -q '^IMAGE_TAG=' .env; then
		sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
	else
		printf 'IMAGE_TAG=%s\n' "$1" >>.env
	fi
}

echo "deploy: ${previous:-none} -> $tag"
# The new release is tried without touching .env: a shell variable overrides .env in Compose.
if ! IMAGE_TAG="$tag" docker compose pull --quiet; then
	echo "deploy: could not pull $tag; nothing changed" >&2
	exit 1
fi

# Database migrations (ADR-0003), before the new release starts: a one-off container of the new API
# image (Compose starts a stopped db first and waits until it is healthy). Each migration runs in one
# transaction, so a failure leaves the schema as it was; a lock or statement that waits too long
# fails (timeouts in site_api/db/migrations/env.py), and the whole step is capped at 5 minutes so
# a stuck run cannot hold the deploy lock. `-T`: no TTY (the CI's forced SSH command has none).
# Migrations stay backward-compatible (add first, remove in a later release), so a rollback below
# still runs on the migrated schema. Downgrades never run here: they can drop data.
if ! IMAGE_TAG="$tag" timeout 300 docker compose run --rm -T api python -m site_api.db.migrate; then
	echo "deploy: migrations for $tag failed; nothing changed" >&2
	exit 1
fi

if IMAGE_TAG="$tag" docker compose up --detach --wait --wait-timeout 180; then
	set_tag "$tag"
	# Images older than a week that no container uses (-a: tagged releases too, not only dangling).
	docker image prune --all --force --filter "until=168h" >/dev/null
	echo "deploy: $tag is healthy"
	exit 0
fi

echo "deploy: $tag did not become healthy" >&2
docker compose logs --no-color --tail 100 >&2 || true
if [ -z "$previous" ]; then
	echo "deploy: no previous release to roll back to; the stack is down" >&2
	exit 1
fi
echo "deploy: rolling back to $previous" >&2
if ! IMAGE_TAG="$previous" docker compose up --detach --wait --wait-timeout 180; then
	echo "deploy: rollback to $previous failed too; the stack needs attention" >&2
fi
exit 1
