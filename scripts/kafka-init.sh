#!/bin/bash
# Starts the Kafka broker, then creates SCRAM-SHA-256 users and ACLs
# idempotently. Runs as PID 1 inside the container. Targets the official
# apache/kafka image (KRaft mode, no ZooKeeper).
set -euo pipefail

: "${KAFKA_ADMIN_USER:?KAFKA_ADMIN_USER must be set}"
: "${KAFKA_ADMIN_PASSWORD:?KAFKA_ADMIN_PASSWORD must be set}"
: "${KAFKA_APP_USER:?KAFKA_APP_USER must be set}"
: "${KAFKA_APP_PASSWORD:?KAFKA_APP_PASSWORD must be set}"

mkdir -p /var/log/kafka

# apache/kafka does not put /opt/kafka/bin on PATH, so every CLI call below
# needs the full path (with the .sh suffix the upstream distribution ships).
KAFKA_BROKER_API_VERSIONS_BIN=/opt/kafka/bin/kafka-broker-api-versions.sh
KAFKA_CONFIGS_BIN=/opt/kafka/bin/kafka-configs.sh
KAFKA_ACLS_BIN=/opt/kafka/bin/kafka-acls.sh

# A KafkaServer JAAS entry is required for the SASL_SSL EXTERNAL listener.
# SCRAM stores credentials in the cluster metadata, so no static password is
# needed in the JAAS file itself.
if [[ -n "${KAFKA_SASL_ENABLED_MECHANISMS:-}" ]]; then
  _JAAS_FILE=/tmp/kafka_server_jaas.conf
  cat > "$_JAAS_FILE" <<'JAAS'
KafkaServer {
  org.apache.kafka.common.security.scram.ScramLoginModule required;
};
JAAS
  export KAFKA_OPTS="-Djava.security.auth.login.config=${_JAAS_FILE}"
  echo "[kafka-init] JAAS config written to ${_JAAS_FILE}"
fi

echo "[kafka-init] Starting broker..."
# /etc/kafka/docker/run is the image's native entrypoint chain
# (configure + KRaft storage format + launch) — reimplementing that here
# isn't worth it, so just run it and take over PID tracking for shutdown.
/etc/kafka/docker/run >>/var/log/kafka/server.out 2>&1 &
BROKER_PID=$!

shutdown() {
  echo "[kafka-init] Stopping broker (pid=$BROKER_PID)..."
  kill -TERM "$BROKER_PID" 2>/dev/null || true
  wait "$BROKER_PID" 2>/dev/null || true
}
trap shutdown INT TERM

echo "[kafka-init] Waiting for broker to accept connections..."
for _ in $(seq 1 90); do
  if "$KAFKA_BROKER_API_VERSIONS_BIN" --bootstrap-server kafka:29092 >/dev/null 2>&1; then
    echo "[kafka-init] Broker is up."
    break
  fi
  sleep 2
done

if ! "$KAFKA_BROKER_API_VERSIONS_BIN" --bootstrap-server kafka:29092 >/dev/null 2>&1; then
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
    "$KAFKA_CONFIGS_BIN" --bootstrap-server kafka:29092 \
      --entity-type users \
      --entity-name "$user" \
      --add-config "SCRAM-SHA-256=[iterations=4096,password=${pass}]" \
      --alter >/dev/null
  }

  create_scram "${KAFKA_ADMIN_USER}" "${KAFKA_ADMIN_PASSWORD}"
  create_scram "${KAFKA_APP_USER}"   "${KAFKA_APP_PASSWORD}"

  add_acl() {
    local principal="$1"; shift
    "$KAFKA_ACLS_BIN" --bootstrap-server kafka:29092 \
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
