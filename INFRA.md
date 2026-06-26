# Infrastructure: Postgres, Kafka, Redis behind host nginx

This adds an infrastructure-only Docker Compose file (`docker-compose.infra.yml`)
that runs **just** the data services — Postgres, Kafka, Redis, plus
Zookeeper for Kafka. All three are exposed to the host through the **system
nginx**, managed by systemd. The application services (`api-gateway`,
`auth`, `events`, `notifications`) still live in the original
`docker-compose.yml` and are not started by this setup.

---

## Architecture

```
                  ┌────────────┐
                  │  postgres  │  :5432   TLS, scram-sha-256
                  │  zookeeper │  :2181   (internal only)
                  │   kafka    │  :29092  PLAINTEXT  (inter-broker / controller)
                  │            │  :29093  SSL         (clients)
                  │   redis    │  :6379   TLS, per-user ACLs
                  └─────┬──────┘
                        │  docker network 172.30.0.0/24
                        │  internal: true  (no egress)
                        ▼
                  ┌────────────┐
                  │   nginx    │  host-system systemd unit
                  │  (stream)  │  + libnginx-mod-stream
                  └──┬────┬───┬─┘
       host:5433 (TCP)──┘    │   └──── host:9093 (TCP) ───> kafka:29093 (SSL)
                            │         (pure TCP pass-through)
                            └────────── host:6380 (TCP) ───> redis:6379
                                          (pure TCP pass-through)
```

Only the host nginx publishes ports. The data services are reachable
**only** from other containers on the same internal docker network. nginx
exposes all three to the host as a pure TCP pass-through — every byte is
TLS from the client to the data service's own TLS-enabled listener. nginx
is just a port forwarder.
- **Postgres** at `localhost:5433` — TCP pass-through; the postgres server
  itself does TLS + scram-sha-256. nginx is just a forwarding box (the
  postgres `SSLRequest` protocol message is incompatible with TLS
  termination in nginx).
- **Kafka** at `localhost:9093` — TCP pass-through; the broker does TLS on
  the SSL listener. Clients connect with `security.protocol=SSL`.
- **Redis** at `localhost:6380` — TCP pass-through; the redis server does
  TLS on the same port. Clients connect with `--tls`.

---

## Security posture

| Concern | Choice |
| --- | --- |
| Postgres auth | `scram-sha-256` only, per-DB roles with no superuser rights |
| Postgres transport | TLS handled by the server itself; nginx is a TCP pass-through |
| Postgres audit | `log_connections`, `log_disconnections`, `log_min_duration_statement=1000` |
| Postgres hardening | `passwordcheck` preload, `public.CREATE` revoked |
| Kafka transport | SSL on the external listener; PLAINTEXT kept **only** for inter-broker / controller on 29092 |
| Kafka topic safety | `auto.create.topics.enable=false` |
| Kafka auth | none on the SSL listener (TLS is the only auth). For SCRAM-SHA-256, see "Adding SASL" below. |
| Redis auth | Per-user ACLs (admin / app / health) with the default user disabled |
| Redis transport | TLS handled by the redis server itself; nginx is a TCP pass-through |
| Redis hardening | `rename-command` disables CONFIG / FLUSHALL / FLUSHDB / KEYS / DEBUG / SHUTDOWN / BGREWRITEAOF / BGSAVE / SAVE / REPLICAOF / ACL / MIGRATE / CLUSTER / FAILOVER / RESET |
| Redis durability | AOF with `appendfsync everysec` |
| nginx | `libnginx-mod-stream`, `read_only` certs, `no-new-privileges` data services, `internal: true` docker network — no egress to host or internet |
| Network | `internal: true` docker network; only host-system nginx reaches the services |
| Container user | `no-new-privileges:true` on every service; data services run as root only so the entrypoints can chown volumes, then drop privileges |
| Secrets | All passwords are 48-byte CSPRNG outputs (`openssl rand -base64 48`), stored `chmod 600` in `.env` (gitignored) |
| TLS | Private CA + nginx server cert + per-service certs; `dhparam.pem` 2048-bit; Mozilla intermediate cipher list |

---

## One-shot setup

```bash
./scripts/bootstrap.sh
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.infra.yml ps
```

`bootstrap.sh` does the following:

1. `scripts/generate-secrets.sh` — creates `.env` with random passwords,
   mode 0600. Idempotent; refuses to overwrite unless `--force`.
2. `scripts/render-templates.sh` — expands `$VAR` in
   `scripts/redis-acl.conf.template` into `scripts/redis-acl.conf`
   (mode 0644 because it is bind-mounted read-only into the redis
   container, which runs as uid 999).
3. `scripts/generate-certs.sh` — generates a private CA, the nginx server
   cert, the dhparam, the Kafka JKS keystore + truststore, the Kafka
   credential files, and the postgres server cert. All signed by the
   same CA.
4. Installs the nginx stream configs to `/etc/nginx/events-fsa/`,
   the TLS material to `/etc/ssl/events-fsa/`, and fixes ownership
   for the postgres (uid 70) and kafka (uid 1000) containers.
5. Enables `libnginx-mod-stream` and appends a `stream { }` block to
   `/etc/nginx/nginx.conf` that includes the events-fsa configs.
6. `scripts/generate-hosts.sh` — writes a managed block into
   `/etc/hosts` so that `postgres`, `kafka`, `redis`, `zookeeper`
   resolve to the docker container IPs (`172.30.0.10`–`.13`).
7. Validates the nginx config and reloads it via systemd.

---

## How to connect

The host ports and credentials are read from `.env`. A small cheat sheet:

| Service | Host port (TLS) | Username | Password | Notes |
| --- | --- | --- | --- | --- |
| Postgres | 5433 | `auth_app` / `events_app` / `notifications_app` / `postgres` | `${POSTGRES_*_PASSWORD}` | TLS, scram-sha-256; superuser is `postgres` and is **not** for apps |
| Kafka (SSL) | 9093 | none | none | TLS only; clients trust the CA cert in `/etc/ssl/events-fsa/ca.crt` |
| Redis | 6380 | `redis_app` (or `redis_admin`, `redis_health`) | `${REDIS_APP_PASSWORD}` | TLS; admin can do everything, app is read/write/pubsub only |

### Postgres

```bash
PGPASSWORD="$POSTGRES_AUTH_PASSWORD" PGSSLMODE=require psql \
  "host=localhost port=5433 user=$POSTGRES_AUTH_USER dbname=auth_db \
   sslrootcert=/etc/ssl/events-fsa/ca.crt"
```

`PGSSLMODE=require` plus `sslrootcert` makes psql verify the chain. Use
`PGSSLMODE=verify-full` if you also want hostname verification (the
server cert SAN includes `localhost` and `postgres`).

### Kafka (kcat)

```bash
kcat -b localhost:9093 -L \
  -X security.protocol=SSL \
  -X ssl.ca.location=/etc/ssl/events-fsa/ca.crt
```

### Redis

```bash
redis-cli -h localhost -p 6380 --tls --cacert /etc/ssl/events-fsa/ca.crt \
  --user "$REDIS_APP_USER" --pass "$REDIS_APP_PASSWORD"
```

Topics are not auto-created; create them with `kafka-topics` (run from
the `events-fsa-infra-kafka-1` container, which has the CLIs on PATH)
or use the PLAINTEXT listener on `kafka:29092` for in-cluster apps that
do not need TLS.

### Redis

```bash
redis-cli -h localhost -p 6380 --tls --cacert /etc/ssl/events-fsa/ca.crt \
  --user "$REDIS_APP_USER" --pass "$REDIS_APP_PASSWORD"
```

The app user is restricted to read/write/pubsub/stream; `FLUSHALL`,
`CONFIG`, `KEYS`, `SHUTDOWN` etc. are blocked both by ACL and by
`rename-command` so the worst-case is "user not allowed" even if the
password leaks.

---

## Wiring TLS in the NestJS apps

The apps (`api-gateway`, `auth`, `events`, `notifications`) connect to the
data services directly on the internal docker network — **not** through
the host nginx. They use the same private CA to verify the server
certificates.

`.env` (rendered by `scripts/generate-secrets.sh` from `.env.example`)
exposes the SSL knobs:

| Var | Used by | Effect |
| --- | --- | --- |
| `KAFKA_BROKER=kafka:29093` | `libs/shared/src/kafka-config.ts` | App reaches the broker on the SSL listener |
| `KAFKA_SECURITY_PROTOCOL=SSL` | same | kafkajs `ssl: { ca, rejectUnauthorized }` |
| `KAFKA_SSL_CA_PATH=/etc/ssl/events-fsa/ca.crt` | same | Path to the CA cert (mounted into the app container) |
| `KAFKA_SASL_MECHANISM` / `KAFKA_SASL_USERNAME` / `KAFKA_SASL_PASSWORD` | same | Optional SCRAM-SHA-256 on top of SSL (see "Adding SASL" below) |
| `DATABASE_SSL_MODE=require` | `libs/shared/src/tls-config.ts` → `pg.Pool` (`PrismaService`) | Encrypts the wire to postgres |
| `DATABASE_SSL_CA_PATH=/etc/ssl/events-fsa/ca.crt` | same | Same CA, same path |
| `*_DATABASE_URL=postgresql://<user>:<pass>@postgres:5432/<db>?schema=public` | `PrismaService` | Per-DB URL with the per-DB role + password (no `sslmode` in the URL — the SSL config is built from the env vars above so the CA can be picked up from disk) |
| `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PASSWORD` | `RedisCacheService` (events) | Connection target |
| `REDIS_TLS=true` | same | `socket.tls = true` on the node-redis client |
| `REDIS_TLS_CA_PATH=/etc/ssl/events-fsa/ca.crt` | same | Pins the events-fsa CA |

The shared helper `libs/shared/src/tls-config.ts` exports `pgSslConfig`,
`redisTlsOption`, `kafkaSslConfig`, and `kafkaSaslConfig`. They read
`process.env` and return `undefined` / `false` when the corresponding
var is missing, so leaving the var unset disables the feature for that
client. Imports use the `@app/shared` path alias (see `tsconfig.json`).

The original `docker-compose.yml` mounts the CA cert read-only into every
app container:

```yaml
volumes:
  - ca-cert:/etc/ssl/events-fsa/ca.crt:ro
```

The `ca-cert` volume is a bind mount of the host's
`/etc/ssl/events-fsa/ca.crt` (declared as a named volume with
`type: none, device: ...`). To bring up the apps with TLS, run
`scripts/bootstrap.sh` first (so the cert exists) and then:

```bash
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.yml up -d
```

---

## File layout

```
.
├── docker-compose.infra.yml      # infra-only compose (no nginx container)
├── .env.example                  # template (checked in)
├── .env                          # generated, gitignored
├── scripts/
│   ├── bootstrap.sh              # one-shot setup
│   ├── generate-secrets.sh       # CSPRNG passwords -> .env
│   ├── render-templates.sh       # envsubst templates
│   ├── generate-certs.sh         # CA, nginx cert, Kafka JKS, postgres cert, dhparam
│   ├── generate-hosts.sh         # writes /etc/hosts entries
│   ├── init-dbs.sql              # CREATE DATABASE x3
│   ├── init-roles.sh             # per-DB roles, least privilege
│   ├── kafka-init.sh             # broker startup wrapper
│   ├── redis.conf                # hardened redis config
│   ├── redis-acl.conf.template   # rendered with secrets
│   └── nginx-stream-block.conf   # appended to /etc/nginx/nginx.conf by bootstrap
├── nginx/
│   ├── conf.d/tls.conf           # Mozilla intermediate TLS
│   ├── stream.conf.d/postgres.conf
│   ├── stream.conf.d/kafka.conf  # pure TCP pass-through
│   ├── stream.conf.d/redis.conf
│   └── certs/                    # generated, gitignored
└── secrets/                      # generated, gitignored
    ├── nginx/dhparam.pem
    └── kafka/{server.keystore.jks, server.truststore.jks, *_creds, ...}
```

### System paths written by `bootstrap.sh`

| Path | Purpose |
| --- | --- |
| `/etc/nginx/events-fsa/conf.d/tls.conf` | Stream TLS settings |
| `/etc/nginx/events-fsa/stream.conf.d/*.conf` | Per-service stream blocks |
| `/etc/nginx/nginx.conf` | Appended with the `stream { }` block |
| `/etc/nginx/modules-enabled/50-mod-stream.conf` | Loads the stream module |
| `/etc/ssl/events-fsa/{server.crt,server.key,ca.crt,postgres.crt,postgres.key,dhparam.pem}` | TLS material for the host nginx and for the postgres container |
| `/etc/ssl/events-fsa/kafka/*` | Kafka JKS / creds (copied so the host can inspect them; the container reads from a bind mount) |
| `/etc/hosts` | Managed block: `postgres`, `kafka`, `redis`, `zookeeper` → 172.30.0.x |

---

## Production notes

1. **Replace the self-signed certs** under `nginx/certs/` and
   `secrets/kafka/` with ones from your internal or public CA. The
   filenames stay the same; the bootstrap script re-runs without
   touching the CA if you want a self-signed root + an internal
   intermediate.
2. **Pin image digests** (`postgres:16-alpine@sha256:...`) in your CI.
3. **Add mTLS at the host nginx** by setting `ssl_verify_client on`
   in each stream block and distributing client certs signed by the
   same CA. The CA is already in `/etc/ssl/events-fsa/ca.crt`.
4. **Kafka SASL**: the current setup has TLS only on the external
   listener. To add SCRAM-SHA-256, re-enable
   `KAFKA_SASL_ENABLED_MECHANISMS=SCRAM-SHA-256` in
   `docker-compose.infra.yml`, switch the `SSL` listener to `SASL_SSL`,
   and re-enable the SCRAM block in `scripts/kafka-init.sh`. Note that
   with the current Confluent 7.6.1 image, the broker can deadlock
   during the SSL self-test if the inter-broker listener is also
   `SASL_SSL`; keep `KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT` to
   avoid it.
5. **Rotate secrets** by re-running `scripts/generate-secrets.sh --force`
   and restarting the stack. The postgres roles and the redis ACL
   are re-applied on the next start; data and Kafka topics are
   preserved.
6. **Reload after cert renewal**: `sudo systemctl reload nginx`.
7. **Adding SASL to Kafka (advanced)**: see the section above. The
   generated `kafka-init.sh` already includes the SCRAM/ACL setup,
   gated on `KAFKA_SASL_ENABLED_MECHANISMS` being set.

See `REVERT.md` for the full teardown runbook (soft stop, wipe data, or
full revert of every file the setup added).
