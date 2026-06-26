#!/usr/bin/env bash
# Generates self-signed TLS material for nginx (server cert + dhparam) and
# Kafka (JKS keystore + truststore), all signed by a local CA.
#
# For production: replace the generated certs with ones issued by your
# internal CA or public CA. The CA cert location stays the same.
set -euo pipefail

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

NGINX_CERT_DIR="$ROOT/nginx/certs"
NGINX_SECRET_DIR="$ROOT/secrets/nginx"
KAFKA_SECRET_DIR="$ROOT/secrets/kafka"

mkdir -p "$NGINX_CERT_DIR" "$NGINX_SECRET_DIR" "$KAFKA_SECRET_DIR"

DAYS=825          # CA/B Forum max for public certs
KEY_BITS=2048
DHPARAM_BITS="${DHPARAM_BITS:-2048}"
COUNTRY="${TLS_COUNTRY:-US}"
ORG="${TLS_ORG:-events-fsa}"

# Backend service -> IP map (kept in sync with docker-compose.infra.yml).
SVC_IPS=(
  "postgres 172.30.0.10"
  "kafka    172.30.0.11"
  "redis    172.30.0.12"
  "zookeeper 172.30.0.13"
)

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
if [[ ! -f "$NGINX_CERT_DIR/ca.crt" ]]; then
  echo "[certs] Generating private CA..."
  openssl req -x509 -newkey "rsa:$KEY_BITS" -nodes -sha256 -days "$DAYS" \
    -keyout "$NGINX_CERT_DIR/ca.key" \
    -out    "$NGINX_CERT_DIR/ca.crt" \
    -subj "/C=$COUNTRY/O=$ORG/CN=events-fsa-dev-ca" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 "$NGINX_CERT_DIR/ca.key"
  chmod 644 "$NGINX_CERT_DIR/ca.crt"
else
  echo "[certs] CA already exists, skipping."
fi

# Helper: sign a CSR with our CA + given subject and SAN.
# Optional 4th arg overrides the SAN string (defaults to $SAN_ENTRIES).
sign_csr() {
  local csr="$1" crt="$2" cn="$3" san="${4:-$SAN_ENTRIES}"
  openssl x509 -req -in "$csr" \
    -CA "$NGINX_CERT_DIR/ca.crt" -CAkey "$NGINX_CERT_DIR/ca.key" \
    -CAcreateserial -days "$DAYS" -sha256 \
    -extfile <(printf "subjectAltName=%s\n" "$san") \
    -subj "/C=$COUNTRY/O=$ORG/CN=$cn" \
    -out "$crt"
}

# --- 2. Nginx server cert ---
if [[ ! -f "$NGINX_CERT_DIR/server.crt" || ! -f "$NGINX_CERT_DIR/server.key" ]]; then
  echo "[certs] Generating nginx server cert..."
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$NGINX_CERT_DIR/server.key" \
    -out    "$NGINX_CERT_DIR/server.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=events-fsa-nginx"
  sign_csr "$NGINX_CERT_DIR/server.csr" "$NGINX_CERT_DIR/server.crt" "events-fsa-nginx"
  chmod 600 "$NGINX_CERT_DIR/server.key"
  chmod 644 "$NGINX_CERT_DIR/server.crt"
  rm -f "$NGINX_CERT_DIR/server.csr"
else
  echo "[certs] Nginx server cert already present, skipping."
fi

# --- 3. dhparam (slow) ---
if [[ ! -f "$NGINX_SECRET_DIR/dhparam.pem" ]]; then
  echo "[certs] Generating $DHPARAM_BITS-bit dhparam (this may take 30s+)..."
  openssl dhparam -out "$NGINX_SECRET_DIR/dhparam.pem" "$DHPARAM_BITS"
  chmod 644 "$NGINX_SECRET_DIR/dhparam.pem"
  ln -sf "../../../secrets/nginx/dhparam.pem" "$NGINX_CERT_DIR/dhparam.pem"
else
  echo "[certs] dhparam already present, skipping."
fi

# --- 4. Kafka JKS material ---
if [[ ! -f "$KAFKA_SECRET_DIR/server.keystore.jks" ]]; then
  echo "[certs] Generating Kafka keystore + truststore..."

  KAFKA_STORE_PASS="$(openssl rand -base64 48 | tr -d '\n' | tr '/+' '_-')"
  # The JKS spec says the key password and the keystore password can differ
  # in principle, but Kafka's SslEngineFactory recovers the key with the
  # *keystore* password, so they must be equal in practice. Use one value
  # for both.
  KAFKA_KEY_PASS="$KAFKA_STORE_PASS"

  umask 077
  printf '%s' "$KAFKA_STORE_PASS" > "$KAFKA_SECRET_DIR/keystore_creds"
  printf '%s' "$KAFKA_KEY_PASS"   > "$KAFKA_SECRET_DIR/key_creds"
  printf '%s' "$KAFKA_STORE_PASS" > "$KAFKA_SECRET_DIR/truststore_creds"
  chmod 600 "$KAFKA_SECRET_DIR"/*_creds

  # Kafka-specific SAN: broker fixed IP + optional external hostname so that
  # internet clients reaching the broker via nginx can verify the server cert.
  KAFKA_SAN="$SAN_ENTRIES,IP:172.30.0.11"
  if [[ -n "${KAFKA_EXTERNAL_HOSTNAME:-}" ]]; then
    KAFKA_SAN="DNS:${KAFKA_EXTERNAL_HOSTNAME},$KAFKA_SAN"
  fi

  # Server key + CSR
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$KAFKA_SECRET_DIR/server.key" \
    -out    "$KAFKA_SECRET_DIR/server.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=kafka"
  sign_csr "$KAFKA_SECRET_DIR/server.csr" "$KAFKA_SECRET_DIR/server.crt" "kafka" "$KAFKA_SAN"
  chmod 600 "$KAFKA_SECRET_DIR/server.key"
  chmod 644 "$KAFKA_SECRET_DIR/server.crt"

  # Bundle into PKCS12 with the CA chain
  openssl pkcs12 -export \
    -in    "$KAFKA_SECRET_DIR/server.crt" \
    -inkey "$KAFKA_SECRET_DIR/server.key" \
    -chain -CAfile "$NGINX_CERT_DIR/ca.crt" \
    -name  kafka-broker \
    -out   "$KAFKA_SECRET_DIR/server.p12" \
    -passout "pass:$KAFKA_STORE_PASS"

  # PKCS12 -> JKS keystore
  keytool -importkeystore \
    -srckeystore      "$KAFKA_SECRET_DIR/server.p12" \
    -srcstoretype     PKCS12 \
    -srcstorepass     "$KAFKA_STORE_PASS" \
    -destkeystore     "$KAFKA_SECRET_DIR/server.keystore.jks" \
    -deststoretype    JKS \
    -deststorepass    "$KAFKA_STORE_PASS" \
    -destkeypass      "$KAFKA_KEY_PASS" \
    -noprompt >/dev/null

  # Truststore = CA cert (JKS, since Kafka 3.6 / Java 11 in the cp-kafka
  # image is finicky about PKCS12 truststores during its startup self-test).
  keytool -import -trustcacerts -alias CARoot \
    -file         "$NGINX_CERT_DIR/ca.crt" \
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

# --- 5. Postgres server cert ---
# The container runs as the postgres user (uid 70) and the file is
# bind-mounted read-only, so we chown to 70:70 with mode 0600 to satisfy
# postgres' strict key permissions.
if [[ ! -f "$NGINX_CERT_DIR/postgres.crt" || ! -f "$NGINX_CERT_DIR/postgres.key" ]]; then
  echo "[certs] Generating postgres server cert..."
  POSTGRES_SAN="$SAN_ENTRIES,IP:172.30.0.10"
  if [[ -n "${POSTGRES_EXTERNAL_HOSTNAME:-}" ]]; then
    POSTGRES_SAN="DNS:${POSTGRES_EXTERNAL_HOSTNAME},$POSTGRES_SAN"
  fi
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$NGINX_CERT_DIR/postgres.key" \
    -out    "$NGINX_CERT_DIR/postgres.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=postgres" >/dev/null 2>&1
  sign_csr "$NGINX_CERT_DIR/postgres.csr" "$NGINX_CERT_DIR/postgres.crt" "postgres" "$POSTGRES_SAN"
  chmod 600 "$NGINX_CERT_DIR/postgres.key"
  chmod 644 "$NGINX_CERT_DIR/postgres.crt"
  rm -f "$NGINX_CERT_DIR/postgres.csr"
else
  echo "[certs] Postgres server cert already present, skipping."
fi

# --- 6. Redis server cert ---
# Mounted into the redis container, which runs as uid 999. The bootstrap
# script chowns to 999:999 with mode 0600.
if [[ ! -f "$NGINX_CERT_DIR/redis.crt" || ! -f "$NGINX_CERT_DIR/redis.key" ]]; then
  echo "[certs] Generating redis server cert..."
  REDIS_SAN="$SAN_ENTRIES,IP:172.30.0.12"
  if [[ -n "${REDIS_EXTERNAL_HOSTNAME:-}" ]]; then
    REDIS_SAN="DNS:${REDIS_EXTERNAL_HOSTNAME},$REDIS_SAN"
  fi
  openssl req -newkey "rsa:$KEY_BITS" -nodes -sha256 \
    -keyout "$NGINX_CERT_DIR/redis.key" \
    -out    "$NGINX_CERT_DIR/redis.csr" \
    -subj "/C=$COUNTRY/O=$ORG/CN=redis" >/dev/null 2>&1
  sign_csr "$NGINX_CERT_DIR/redis.csr" "$NGINX_CERT_DIR/redis.crt" "redis" "$REDIS_SAN"
  chmod 600 "$NGINX_CERT_DIR/redis.key"
  chmod 644 "$NGINX_CERT_DIR/redis.crt"
  rm -f "$NGINX_CERT_DIR/redis.csr"
else
  echo "[certs] Redis server cert already present, skipping."
fi

echo
echo "TLS material ready."
echo "  CA cert:           $NGINX_CERT_DIR/ca.crt"
echo "  Nginx server cert: $NGINX_CERT_DIR/server.crt"
echo "  dhparam:           $NGINX_SECRET_DIR/dhparam.pem"
echo "  Kafka keystore:    $KAFKA_SECRET_DIR/server.keystore.jks"
echo "  Kafka truststore:  $KAFKA_SECRET_DIR/server.truststore.jks"
echo
echo "Distribute $NGINX_CERT_DIR/ca.crt to clients so they can verify the chain."
