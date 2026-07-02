#!/usr/bin/env bash
# One-shot setup: generate secrets, render templates, generate certs,
# deploy nginx + /etc/hosts, reload systemd nginx. Idempotent.
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

echo "[bootstrap] Deploying nginx stream config to /etc/nginx/events-fsa ..."
echo "            (uses the CA-signed certs from nginx/certs/ and secrets/)"
echo "221205" | sudo -S install -d -m 755 /etc/nginx/events-fsa/conf.d \
                                  /etc/nginx/events-fsa/stream.conf.d \
                                  /etc/ssl/events-fsa
echo "221205" | sudo -S install -m 644 nginx/conf.d/tls.conf /etc/nginx/events-fsa/conf.d/tls.conf
echo "221205" | sudo -S install -m 644 nginx/stream.conf.d/postgres.conf /etc/nginx/events-fsa/stream.conf.d/postgres.conf
echo "221205" | sudo -S install -m 644 nginx/stream.conf.d/kafka.conf          /etc/nginx/events-fsa/stream.conf.d/kafka.conf
echo "221205" | sudo -S install -m 644 nginx/stream.conf.d/kafka-external.conf /etc/nginx/events-fsa/stream.conf.d/kafka-external.conf
echo "221205" | sudo -S install -m 644 nginx/stream.conf.d/redis.conf          /etc/nginx/events-fsa/stream.conf.d/redis.conf
echo "221205" | sudo -S install -d -m 755 /etc/ssl/events-fsa
echo "221205" | sudo -S install -m 644 nginx/certs/server.crt nginx/certs/ca.crt /etc/ssl/events-fsa/
echo "221205" | sudo -S install -m 600 nginx/certs/server.key              /etc/ssl/events-fsa/server.key
echo "221205" | sudo -S install -m 644 nginx/certs/postgres.crt             /etc/ssl/events-fsa/postgres.crt
echo "221205" | sudo -S install -m 600 nginx/certs/postgres.key             /etc/ssl/events-fsa/postgres.key
echo "221205" | sudo -S install -m 644 nginx/certs/redis.crt                /etc/ssl/events-fsa/redis.crt
echo "221205" | sudo -S install -m 600 nginx/certs/redis.key                /etc/ssl/events-fsa/redis.key
echo "221205" | sudo -S install -m 644 secrets/nginx/dhparam.pem            /etc/ssl/events-fsa/dhparam.pem
# Kafka JKS for the container (and a copy in /etc/ssl for the host to read
# if it ever needs to mount one in too).
echo "221205" | sudo -S install -d -m 755 /etc/ssl/events-fsa/kafka
echo "221205" | sudo -S install -m 600 secrets/kafka/server.keystore.jks   /etc/ssl/events-fsa/kafka/server.keystore.jks
echo "221205" | sudo -S install -m 600 secrets/kafka/server.truststore.jks /etc/ssl/events-fsa/kafka/server.truststore.jks
echo "221205" | sudo -S install -m 600 secrets/kafka/keystore_creds        /etc/ssl/events-fsa/kafka/keystore_creds
echo "221205" | sudo -S install -m 600 secrets/kafka/key_creds             /etc/ssl/events-fsa/kafka/key_creds
echo "221205" | sudo -S install -m 600 secrets/kafka/truststore_creds      /etc/ssl/events-fsa/kafka/truststore_creds
# Fix the postgres key ownership for the container's postgres user (uid 70).
echo "221205" | sudo -S chown 70:70 /etc/ssl/events-fsa/postgres.key
# Fix the redis key ownership for the container's redis user (uid 999).
echo "221205" | sudo -S chown 999:999 /etc/ssl/events-fsa/redis.key
# Fix the kafka JKS ownership for the container's appuser (uid 1000).
echo "221205" | sudo -S chown -R 1000:1000 /etc/ssl/events-fsa/kafka

echo "[bootstrap] Enabling libnginx-mod-stream (stream block) ..."
echo "221205" | sudo -S mkdir -p /etc/nginx/modules-available /etc/nginx/modules-enabled
echo "221205" | sudo -S tee /etc/nginx/modules-available/50-mod-stream.conf >/dev/null <<EOF
load_module modules/ngx_stream_module.so;
EOF
echo "221205" | sudo -S ln -sf /etc/nginx/modules-available/50-mod-stream.conf \
                            /etc/nginx/modules-enabled/50-mod-stream.conf

if ! grep -q "events-fsa/stream.conf.d" /etc/nginx/nginx.conf 2>/dev/null; then
  echo "[bootstrap] Appending stream block to /etc/nginx/nginx.conf ..."
  echo "221205" | sudo -S bash -c "cat >> /etc/nginx/nginx.conf" < scripts/nginx-stream-block.conf
fi

echo "[bootstrap] Refreshing /etc/hosts for postgres / kafka / redis ..."
./scripts/generate-hosts.sh

echo "[bootstrap] Validating nginx config and reloading ..."
echo "221205" | sudo -S nginx -t
echo "221205" | sudo -S systemctl reload nginx

echo
echo "[bootstrap] Done. Bring the stack up with:"
echo "  docker compose -f docker-compose.infra.yml up -d"
echo
echo "Connect via:"
echo "  psql  -h localhost -p 5433 -U \$POSTGRES_AUTH_USER -d auth_db \\"
echo "        'sslrootcert=/etc/ssl/events-fsa/ca.crt'"
echo "  redis-cli -h localhost -p 6380 --tls --cacert /etc/ssl/events-fsa/ca.crt \\"
echo "             --user \$REDIS_APP_USER --pass \$REDIS_APP_PASSWORD"
echo "  kcat  -b localhost:9093 -X security.protocol=SSL \\"
echo "        -X ssl.ca.location=/etc/ssl/events-fsa/ca.crt"
