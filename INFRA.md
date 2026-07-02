# Infrastructure: Postgres, Kafka, Redis

`docker-compose.infra.yml` runs the three data services. Each one publishes host ports directly and handles TLS itself — no reverse proxy in the way.

## Architecture

```
  ┌────────────────────────────────────────┐
  │  docker network 172.30.0.0/24          │
  │                                        │
  │  postgres  172.30.0.10  :5432  TLS     │──► host:5432
  │  kafka     172.30.0.11  :29093 SSL     │──► host:29093 (in-cluster)
  │                         :29094 SASL_SSL│──► host:29094 (external)
  │  redis     172.30.0.12  :6379  TLS     │──► host:6379
  └────────────────────────────────────────┘
```

App containers (in `docker-compose.yml` / `docker-compose.dev.yml`) join `events-fsa-infra_backend` and reach services by hostname: `postgres:5432`, `kafka:29093`, `redis:6379`.

## Setup

```bash
bash scripts/bootstrap.sh
docker compose -f docker-compose.infra.yml up -d
```

`bootstrap.sh`:
1. `generate-secrets.sh` — creates `.env` with random passwords (mode 0600, gitignored)
2. `render-templates.sh` — renders `scripts/redis-acl.conf` from template
3. `generate-certs.sh` — generates CA + per-service certs into `certs/`
4. `generate-hosts.sh` — adds `postgres`, `kafka`, `redis` entries to `/etc/hosts`

## Security

| Concern | Choice |
|---|---|
| Postgres auth | `scram-sha-256`, per-DB roles, no superuser for apps |
| Postgres transport | `ssl=on` — server does TLS, `rejectUnauthorized: true` in apps |
| Kafka transport | SSL listener (`kafka:29093`) for in-cluster; SASL_SSL (`kafka:29094`) for external |
| Redis auth | Per-user ACLs (admin / app / health); default user disabled |
| Redis transport | TLS via `tls-port 6379` in redis.conf |
| Secrets | 48-byte CSPRNG (`openssl rand -base64 48`), `chmod 600 .env` |
| TLS | Private CA + per-service certs; 825-day validity; SANs include service hostnames + IPs |

## Connect from host

```bash
# Postgres
PGPASSWORD="$POSTGRES_AUTH_PASSWORD" psql \
  "host=localhost port=5432 user=$POSTGRES_AUTH_USER dbname=auth_db \
   sslmode=require sslrootcert=certs/ca.crt"

# Redis
redis-cli -h localhost -p 6379 --tls --cacert certs/ca.crt \
  --user "$REDIS_APP_USER" --pass "$REDIS_APP_PASSWORD"

# Kafka (SSL, no SASL — in-cluster listener)
kcat -b localhost:29093 -L -X security.protocol=SSL -X ssl.ca.location=certs/ca.crt

# Kafka (SASL_SSL — external listener)
kcat -b localhost:29094 -L \
  -X security.protocol=SASL_SSL -X ssl.ca.location=certs/ca.crt \
  -X sasl.mechanism=SCRAM-SHA-256 \
  -X sasl.username="$KAFKA_APP_USER" -X sasl.password="$KAFKA_APP_PASSWORD"
```

## File layout

```
.
├── docker-compose.infra.yml   # infra-only stack
├── docker-compose.yml         # app services (remote/shared infra)
├── docker-compose.dev.yml     # full local stack (infra + apps)
├── certs/                     # generated, gitignored
│   ├── ca.{crt,key}
│   ├── postgres.{crt,key}
│   └── redis.{crt,key}
├── ca.crt                     # copy of certs/ca.crt for app container mounts
├── secrets/kafka/             # JKS keystores + creds, gitignored
├── scripts/
│   ├── bootstrap.sh
│   ├── generate-secrets.sh
│   ├── render-templates.sh
│   ├── generate-certs.sh
│   ├── generate-hosts.sh
│   ├── init-dbs.sql
│   ├── init-roles.sh
│   ├── kafka-init.sh
│   ├── redis.conf
│   └── redis-acl.conf.template
└── docs/
    └── rm-service-nginx.md    # cleanup guide for servers that had the old nginx setup
```

## Rotate secrets

```bash
bash scripts/generate-secrets.sh --force
bash scripts/render-templates.sh
docker compose -f docker-compose.infra.yml up -d
```

## Rotate certs

```bash
rm -rf certs/ secrets/kafka/ ca.crt
bash scripts/generate-certs.sh
docker compose -f docker-compose.infra.yml up -d
```
