#!/bin/bash
# Creates a least-privileged role per application database and locks the
# public schema. Runs once at first container start.
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER (superuser) must be set}"
: "${POSTGRES_DB:?POSTGRES_DB (superuser db) must be set}"

PSQL=(psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB")

# Skip if the first role already exists (idempotent re-runs).
if "${PSQL[@]}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_AUTH_USER}'" | grep -q 1; then
  echo "Roles already initialised, skipping."
  exit 0
fi

create_role() {
  local role=$1
  local password=$2
  local db=$3
  "${PSQL[@]}" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE "${role}" LOGIN PASSWORD '${password}';
  ELSE
    ALTER ROLE "${role}" WITH LOGIN PASSWORD '${password}';
  END IF;
END
\$\$;
SQL
  "${PSQL[@]}" -c "GRANT CONNECT ON DATABASE \"${db}\" TO \"${role}\";"
  "${PSQL[@]}" -d "${db}" <<SQL
GRANT USAGE, CREATE ON SCHEMA public TO "${role}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON TABLES TO "${role}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE
    ON SEQUENCES TO "${role}";
GRANT TEMPORARY ON DATABASE "${db}" TO "${role}";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
}

create_role "${POSTGRES_AUTH_USER}"          "${POSTGRES_AUTH_PASSWORD}"          auth_db
create_role "${POSTGRES_EVENTS_USER}"        "${POSTGRES_EVENTS_PASSWORD}"        events_db
create_role "${POSTGRES_NOTIFICATIONS_USER}" "${POSTGRES_NOTIFICATIONS_PASSWORD}" notifications_db

# Superuser keeps DDL rights on all three DBs for migrations; nothing else gets superuser.
"${PSQL[@]}" -c "ALTER DATABASE auth_db          OWNER TO ${POSTGRES_USER};"
"${PSQL[@]}" -c "ALTER DATABASE events_db        OWNER TO ${POSTGRES_USER};"
"${PSQL[@]}" -c "ALTER DATABASE notifications_db OWNER TO ${POSTGRES_USER};"
