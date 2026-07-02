#!/usr/bin/env bash
# Generates self-signed TLS material for Kafka (JKS keystore + truststore),
# Postgres, and Redis — all signed by a local CA.
#
# For production: replace the generated certs with ones from your internal
# or public CA. The CA cert location stays the same.
set -euo pipefail

# Prevent Git Bash / MSYS2 from converting Unix-style /C=US/O=... subject
# strings into Windows paths like C:/Program Files/Git/C=US/...
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE - run scripts/generate-secrets.sh first." >&2
  exit 1
fi

if ! command -v openssl >/dev/null; then
  echo "openssl is required" >&2; exit 1
fi
if ! command -v keytool >/dev/null; then
  echo "keytool (JDK) is required for the Kafka JKS keystore" >&2; exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

CERT_DIR="$ROOT/certs"
KAFKA_SECRET_DIR="$ROOT/secrets/kafka"

mkdir -p "$CERT_DIR" "$KAFKA_SECRET_DIR"

# Use a minimal self-contained OpenSSL config so the system openssl.cnf
# cannot inject extensions that vary across OpenSSL versions (e.g. the
# keyid:nonss option removed in OpenSSL 3.5).
# Place in project root so cygpath can convert it to a Windows path that
# Windows OpenSSL.exe can open (MSYS_NO_PATHCONV=1 disables auto-conversion).
TMP_CNF="$ROOT/.openssl-cfg.tmp"
trap 'rm -f "$TMP_CNF"' EXIT
cat > "$TMP_CNF" <<'OPENSSL_CNF'
[req]
distinguished_name = req_distinguished_name
prompt             = no
[req_distinguished_name]
OPENSSL_CNF
if command -v cygpath >/dev/null 2>&1; then
  export OPENSSL_CONF="$(cygpath -w "$TMP_CNF")"
else
  export OPENSSL_CONF="$TMP_CNF"
fi

DAYS=825
KEY_BITS=2048
COUNTRY="${TLS_COUNTRY:-US}"
ORG="${TLS_ORG:-events-fsa}"

# --- Build SAN list ---
SAN_ENTRIES=""
IFS=',' read -ra D <<<"${TLS_SAN_DNS:-localhost}"
for h in "${D[@]}"; do
  h="$(echo "$h" | xargs)"
  [[ -n "$h" ]] && SAN_ENTRIES+="DNS:$h,"
done
IFS=',' read -ra I <<<"${TLS_SAN_IPS:-127.0.0.1}"
for ip in "${I[@]}"; do
  ip="$(echo "$ip" | xargs)"
  [[ -n "$ip" ]] && SAN_ENTRIES+="IP:$ip,"
done
SAN_ENTRIES="${SAN_ENTRIES%,}"
echo "SAN entries: $SAN_ENTRIES"

# --- 1. Private CA ---
if [[ ! -f "$CERT_DIR/ca.crt" ]]; then
  echo "[certs] Generating private CA..."
  openssl req -x509 -newkey "rsa:$KEY_BITS" -nodes -sha256 -days "$DAYS" \
    -keyout "$CERT_DIR/ca.key" \
    -out    "$CERT_DIR/ca.crt" \
    -subj "/C=$COUNTRY/O=$ORG/CN=events-fsa-dev-ca" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 "$CERT_DIR/ca.key"
  chmod 644 "$CERT_DIR/ca.crt"
else
  echo "[certs] CA already exists, skipping."
fi

# Helper: sign a CSR with our CA + given subject and SAN.
sign_csr() {
  local csr="$1" crt="$2" cn="$3" san="${4:-$SAN_ENTRIES}"
  openssl x509 -req -in "$csr" \
    -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -days "$DAYS" -sha256 \
    -extfile <(printf "subjectAltName=%s\n" "$san") \
    -subj "/C=$COUNTRY/O=$ORG/CN=$cn" \
    -out "$crt"
}

# --- 2. Kafka JKS material ---
if [[ ! -f "$KAFKA_SECRET_DIR/server.keystore.jks" ]]; then
  echo "[certs] Generating Kafka keystore + truststore..."

  KAFKA_STORE_PASS="$(openssl rand -base64 48 | tr -d '\n' | tr '/+' '_-')"
  KAFKA_KEY_PASS="$KAFKA_STORE_PASS"

  umask 077
  printf '%s' "$KAFKA_STORE_PASS" > "$KAFKA_SECRET_DIR/keystore_creds"
  printf '%s' "$KAFKA_KEY_PASS"   > "$KAFKA_SECRET_DIR/key_creds"
  printf '%s' "$KAFKA_STORE_PASS" > "$KAFKA_SECRET_DIR/truststore_creds"
  chmod 600 "$KAFKA_SECRET_DIR"/*_creds

  KAFKA_SAN="$SAN_ENTRIES,IP:172.30.0.11"
  if [[ -n "${KAFKA_EXTERNAL_HOSTNAME:-}" ]]; then
    KAFKA_SAN="DNS:${KAFKA_EXTERNAL_HOSTNAME},$KAFKA_SAN"
  fi

  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$KAFKA_SECRET_DIR/server.key" \
    -out    "$KAFKA_SECRET_DIR/server.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=kafka"
  sign_csr "$KAFKA_SECRET_DIR/server.csr" "$KAFKA_SECRET_DIR/server.crt" "kafka" "$KAFKA_SAN"
  chmod 600 "$KAFKA_SECRET_DIR/server.key"
  chmod 644 "$KAFKA_SECRET_DIR/server.crt"

  openssl pkcs12 -export \
    -in    "$KAFKA_SECRET_DIR/server.crt" \
    -inkey "$KAFKA_SECRET_DIR/server.key" \
    -chain -CAfile "$CERT_DIR/ca.crt" \
    -name  kafka-broker \
    -out   "$KAFKA_SECRET_DIR/server.p12" \
    -passout "pass:$KAFKA_STORE_PASS"

  keytool -importkeystore \
    -srckeystore      "$KAFKA_SECRET_DIR/server.p12" \
    -srcstoretype     PKCS12 \
    -srcstorepass     "$KAFKA_STORE_PASS" \
    -destkeystore     "$KAFKA_SECRET_DIR/server.keystore.jks" \
    -deststoretype    JKS \
    -deststorepass    "$KAFKA_STORE_PASS" \
    -destkeypass      "$KAFKA_KEY_PASS" \
    -noprompt >/dev/null

  keytool -import -trustcacerts -alias CARoot \
    -file         "$CERT_DIR/ca.crt" \
    -keystore     "$KAFKA_SECRET_DIR/server.truststore.jks" \
    -storetype    JKS \
    -storepass    "$KAFKA_STORE_PASS" \
    -noprompt >/dev/null

  chmod 600 "$KAFKA_SECRET_DIR"/*.jks
  rm -f "$KAFKA_SECRET_DIR/server.csr" "$KAFKA_SECRET_DIR/server.p12"
  unset KAFKA_STORE_PASS KAFKA_KEY_PASS
else
  echo "[certs] Kafka keystore already present, skipping."
fi

# --- 3. Postgres server cert ---
if [[ ! -f "$CERT_DIR/postgres.crt" || ! -f "$CERT_DIR/postgres.key" ]]; then
  echo "[certs] Generating postgres server cert..."
  POSTGRES_SAN="$SAN_ENTRIES,IP:172.30.0.10"
  if [[ -n "${POSTGRES_EXTERNAL_HOSTNAME:-}" ]]; then
    POSTGRES_SAN="DNS:${POSTGRES_EXTERNAL_HOSTNAME},$POSTGRES_SAN"
  fi
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$CERT_DIR/postgres.key" \
    -out    "$CERT_DIR/postgres.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=postgres" >/dev/null 2>&1
  sign_csr "$CERT_DIR/postgres.csr" "$CERT_DIR/postgres.crt" "postgres" "$POSTGRES_SAN"
  chmod 600 "$CERT_DIR/postgres.key"
  chmod 644 "$CERT_DIR/postgres.crt"
  rm -f "$CERT_DIR/postgres.csr"
else
  echo "[certs] Postgres server cert already present, skipping."
fi

# --- 4. Redis server cert ---
if [[ ! -f "$CERT_DIR/redis.crt" || ! -f "$CERT_DIR/redis.key" ]]; then
  echo "[certs] Generating redis server cert..."
  REDIS_SAN="$SAN_ENTRIES,IP:172.30.0.12"
  if [[ -n "${REDIS_EXTERNAL_HOSTNAME:-}" ]]; then
    REDIS_SAN="DNS:${REDIS_EXTERNAL_HOSTNAME},$REDIS_SAN"
  fi
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$CERT_DIR/redis.key" \
    -out    "$CERT_DIR/redis.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=redis" >/dev/null 2>&1
  sign_csr "$CERT_DIR/redis.csr" "$CERT_DIR/redis.crt" "redis" "$REDIS_SAN"
  chmod 600 "$CERT_DIR/redis.key"
  chmod 644 "$CERT_DIR/redis.crt"
  rm -f "$CERT_DIR/redis.csr"
else
  echo "[certs] Redis server cert already present, skipping."
fi

cp "$CERT_DIR/ca.crt" "$ROOT/ca.crt"
chmod 644 "$ROOT/ca.crt"

echo
echo "TLS material ready."
echo "  CA cert:        $CERT_DIR/ca.crt  →  ca.crt (project root)"
echo "  Postgres cert:  $CERT_DIR/postgres.crt"
echo "  Redis cert:     $CERT_DIR/redis.crt"
echo "  Kafka keystore: $KAFKA_SECRET_DIR/server.keystore.jks"
echo
echo "Distribute $CERT_DIR/ca.crt to clients so they can verify the chain."
