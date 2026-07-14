#!/usr/bin/env bash
# One-shot setup: generate secrets and update /etc/hosts. Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[bootstrap] Generating .env..."
if [[ ! -f .env ]]; then
  ./scripts/generate-secrets.sh
else
  echo "[bootstrap] .env already exists, reusing it."
fi

echo "[bootstrap] Refreshing /etc/hosts for postgres / kafka / redis ..."
./scripts/generate-hosts.sh

echo
echo "[bootstrap] Done. Bring the stack up with:"
echo "  docker compose -f docker-compose.infra.yml up -d"
echo
echo "Connect via (ports are published directly, plaintext):"
echo "  psql  'host=localhost port=5432 user=\$POSTGRES_AUTH_USER dbname=auth_db'"
echo "  redis-cli -h localhost -p 6379"
echo "  kcat  -b localhost:29092 -L"
