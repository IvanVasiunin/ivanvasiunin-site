#!/bin/sh
# Scans what the images ship for phone numbers and secrets (golden rule 5) and for data/raw files.
# Used by CI (job `infra`) and by the deploy workflow before pushing, so a deployed image is always a
# scanned one. Needs gitleaks on PATH and the repository's .gitleaks.toml (run from the repo root).
#   infra/scan-images.sh <web image> <api image>
set -eu

web_image="$1"
api_image="$2"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/web" "$out/api"

# What we ship: the static site, and the API package (dependencies are third-party code).
web="$(docker create "$web_image")"
api="$(docker create "$api_image")"
docker cp "$web:/srv/." "$out/web/"
docker cp "$api:/app/.venv/lib/python3.13/site-packages/site_api/." "$out/api/"
docker rm "$web" "$api" >/dev/null

gitleaks dir --config .gitleaks.toml --redact --no-banner --verbose "$out"

for image in "$web_image" "$api_image"; do
	found="$(docker run --rm --entrypoint sh "$image" -c \
		'find / -xdev \( -path /proc -o -path /sys \) -prune -o -path "*data/raw*" -print 2>/dev/null')"
	if [ -n "$found" ]; then
		echo "scan-images: $image contains data/raw files:" >&2
		echo "$found" >&2
		exit 1
	fi
done
echo "scan-images: no phone numbers, secrets or data/raw in $web_image and $api_image"
