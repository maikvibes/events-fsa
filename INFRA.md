# Infrastructure: Postgres, Kafka, Redis

`docker-compose.infra.yml` runs the three data services. Each publishes its host port directly. All connections are plaintext — no TLS, no Kafka SASL, no Redis auth.

## Architecture

```
  ┌────────────────────────────────────────┐
  │  docker network (backend)              │
  │                                        │
  │  postgres  :5432   plaintext           │──► host:5432
  │  kafka     :29092  PLAINTEXT           │──► host:29092
  │  redis     :6379   plaintext           │──► host:6379
  └────────────────────────────────────────┘
```

App containers (in `docker-compose.yml` / `docker-compose.dev.yml`) join the `backend` network and reach services by hostname: `postgres:5432`, `kafka:29092`, `redis:6379`.

## Setup

```bash
bash scripts/bootstrap.sh
docker compose -f docker-compose.infra.yml up -d
```

`bootstrap.sh`:
1. `generate-secrets.sh` — creates `.env` with random Postgres passwords + JWT secret (mode 0600, gitignored)
2. `generate-hosts.sh` — adds `postgres`, `kafka`, `redis` entries to `/etc/hosts`

## Auth model

| Concern | Choice |
|---|---|
| Postgres auth | Per-DB roles with passwords, no superuser for apps |
| Postgres transport | Plaintext |
| Kafka | PLAINTEXT listener (`kafka:29092`), no SASL |
| Redis | No auth, plaintext |
| Secrets | Postgres passwords + JWT: 48-byte CSPRNG (`openssl rand -base64 48`), `chmod 600 .env` |

## Connect from host

```bash
# Postgres
PGPASSWORD="$POSTGRES_AUTH_PASSWORD" psql \
  "host=localhost port=5432 user=$POSTGRES_AUTH_USER dbname=auth_db"

# Redis
redis-cli -h localhost -p 6379

# Kafka
kcat -b localhost:29092 -L
```

## File layout

```
.
├── docker-compose.infra.yml   # infra-only stack
├── docker-compose.yml         # app services (remote/shared infra)
├── docker-compose.dev.yml     # full local stack (infra + apps)
└── scripts/
    ├── bootstrap.sh
    ├── generate-secrets.sh
    ├── generate-hosts.sh
    ├── init-dbs.sql
    └── init-roles.sh
```

## Rotate secrets

```bash
bash scripts/generate-secrets.sh --force
docker compose -f docker-compose.infra.yml up -d
```
