#!/bin/bash
# Starts the Kafka broker, then creates SCRAM-SHA-256 users and ACLs
# idempotently. Runs as PID 1 inside the container.
set -euo pipefail

: "${KAFKA_ADMIN_USER:?KAFKA_ADMIN_USER must be set}"
: "${KAFKA_ADMIN_PASSWORD:?KAFKA_ADMIN_PASSWORD must be set}"
: "${KAFKA_APP_USER:?KAFKA_APP_USER must be set}"
: "${KAFKA_APP_PASSWORD:?KAFKA_APP_PASSWORD must be set}"

echo "[kafka-init] Rendering config from environment..."
. /etc/confluent/docker/configure

echo "[kafka-init] Starting broker..."
mkdir -p /var/log/kafka
# The configure script writes to /etc/kafka/kafka.properties (NOT server.properties).
kafka-server-start /etc/kafka/kafka.properties >>/var/log/kafka/server.out 2>&1 &
BROKER_PID=$!

shutdown() {
  echo "[kafka-init] Stopping broker (pid=$BROKER_PID)..."
  kill -TERM "$BROKER_PID" 2>/dev/null || true
  wait "$BROKER_PID" 2>/dev/null || true
}
trap shutdown INT TERM

echo "[kafka-init] Waiting for broker to accept connections..."
for _ in $(seq 1 90); do
  if kafka-broker-api-versions --bootstrap-server kafka:29092 >/dev/null 2>&1; then
    echo "[kafka-init] Broker is up."
    break
  fi
  sleep 2
done

if ! kafka-broker-api-versions --bootstrap-server kafka:29092 >/dev/null 2>&1; then
  echo "[kafka-init] ERROR: broker did not become ready." >&2
  tail -n 200 /var/log/kafka/server.out >&2 || true
  exit 1
fi

# SCRAM-SHA-256 users are created only when the broker has a SASL listener.
# In PLAINTEXT-only mode this is a no-op (kept for completeness when the
# SASL_SSL listener is re-enabled).
if [[ -n "${KAFKA_SASL_ENABLED_MECHANISMS:-}" ]]; then
  create_scram() {
    local user="$1" pass="$2"
    echo "[kafka-init] Ensuring SCRAM user: $user"
    kafka-configs --zookeeper zookeeper:2181 \
      --entity-type users \
      --entity-name "$user" \
      --add-config "SCRAM-SHA-256=[iterations=4096,password=${pass}]" \
      --alter >/dev/null
  }

  create_scram "${KAFKA_ADMIN_USER}" "${KAFKA_ADMIN_PASSWORD}"
  create_scram "${KAFKA_APP_USER}"   "${KAFKA_APP_PASSWORD}"

  add_acl() {
    local principal="$1"; shift
    kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 \
      --add --allow-principal "User:${principal}" "$@" 2>/dev/null || true
  }

  echo "[kafka-init] Applying ACLs..."
  add_acl "${KAFKA_ADMIN_USER}" --cluster '*' --operation '*'
  add_acl "${KAFKA_APP_USER}"   --cluster '*' --operation Describe
  add_acl "${KAFKA_APP_USER}"   --topic  '*'  --operation All
  add_acl "${KAFKA_APP_USER}"   --group  '*'  --operation All
else
  echo "[kafka-init] No SASL listener configured; skipping SCRAM/ACL setup."
fi

echo "[kafka-init] Init complete; waiting on broker pid=$BROKER_PID"
wait "$BROKER_PID"
