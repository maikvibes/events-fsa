#!/usr/bin/env bash
# Renders templated config files (e.g. redis-acl.conf) from .env.
# Idempotent: re-running just overwrites the generated files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE - run scripts/generate-secrets.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

render() {
  local template="$1" out="$2" mode="${3:-600}"
  echo "Rendering $template -> $out (mode $mode)"
  envsubst < "$ROOT/$template" > "$ROOT/$out"
  chmod "$mode" "$ROOT/$out"
}

# 0644 because the file is bind-mounted read-only into the redis container,
# which runs as uid 999 after the entrypoint drops privileges. The host
# file's owner (typically 1000) cannot be guaranteed to match.
render "scripts/redis-acl.conf.template" "scripts/redis-acl.conf" "644"

echo "Done."
