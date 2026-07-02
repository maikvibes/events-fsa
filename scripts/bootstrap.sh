#!/usr/bin/env bash
# One-shot setup: generate secrets, render templates, generate certs,
# update /etc/hosts. Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[bootstrap] Generating .env..."
if [[ ! -f .env ]]; then
  ./scripts/generate-secrets.sh
else
  echo "[bootstrap] .env already exists, reusing it."
fi

echo "[bootstrap] Rendering config templates..."
./scripts/render-templates.sh

echo "[bootstrap] Generating TLS material..."
./scripts/generate-certs.sh

echo "[bootstrap] Refreshing /etc/hosts for postgres / kafka / redis ..."
./scripts/generate-hosts.sh

echo
echo "[bootstrap] Done. Bring the stack up with:"
echo "  docker compose -f docker-compose.infra.yml up -d"
echo
echo "Connect via (ports are published directly):"
echo "  psql  'host=localhost port=5432 user=\$POSTGRES_AUTH_USER dbname=auth_db sslmode=require sslrootcert=certs/ca.crt'"
echo "  redis-cli -h localhost -p 6379 --tls --cacert certs/ca.crt --user \$REDIS_APP_USER --pass \$REDIS_APP_PASSWORD"
echo "  kcat  -b localhost:29094 -X security.protocol=SASL_SSL -X ssl.ca.location=certs/ca.crt"
