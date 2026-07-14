// Idempotent database + role provisioning, run by the `migrate` service before
// `prisma migrate deploy`. The postgres init scripts (init-dbs.sql / init-roles.sh)
// only run on a FRESH volume, so adding a new service (e.g. analytics) to an
// already-provisioned deployment would otherwise fail migrate with a missing
// database/role. This reconciles them on every deploy, superuser-authenticated.
//
// Env: POSTGRES_HOST (default "postgres"), POSTGRES_SUPERUSER,
//      POSTGRES_SUPERUSER_PASSWORD, POSTGRES_SUPERUSER_DB (default "postgres"),
//      and POSTGRES_<SVC>_USER / _PASSWORD per service.
import pg from 'pg';

const HOST = process.env.POSTGRES_HOST ?? 'postgres';
const PORT = Number(process.env.POSTGRES_PORT ?? 5432);
const SUPERUSER = process.env.POSTGRES_SUPERUSER ?? 'postgres';
const SUPERPASS = process.env.POSTGRES_SUPERUSER_PASSWORD ?? 'postgres';
const SUPERDB = process.env.POSTGRES_SUPERUSER_DB ?? 'postgres';

const SERVICES = [
  { db: 'auth_db', user: process.env.POSTGRES_AUTH_USER ?? 'auth_app', pass: process.env.POSTGRES_AUTH_PASSWORD ?? 'auth_pass' },
  { db: 'events_db', user: process.env.POSTGRES_EVENTS_USER ?? 'events_app', pass: process.env.POSTGRES_EVENTS_PASSWORD ?? 'events_pass' },
  { db: 'notifications_db', user: process.env.POSTGRES_NOTIFICATIONS_USER ?? 'notif_app', pass: process.env.POSTGRES_NOTIFICATIONS_PASSWORD ?? 'notif_pass' },
  { db: 'analytics_db', user: process.env.POSTGRES_ANALYTICS_USER ?? 'analytics_app', pass: process.env.POSTGRES_ANALYTICS_PASSWORD ?? 'analytics_pass' },
];

function admin(database) {
  return new pg.Client({ host: HOST, port: PORT, user: SUPERUSER, password: SUPERPASS, database });
}

async function ensureService({ db, user, pass }) {
  const root = admin(SUPERDB);
  await root.connect();
  try {
    const dbExists = await root.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (!dbExists.rowCount) {
      await root.query(`CREATE DATABASE "${db}"`);
      console.log(`created database ${db}`);
    }
    const roleExists = await root.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user]);
    if (!roleExists.rowCount) {
      await root.query(`CREATE ROLE "${user}" LOGIN PASSWORD '${pass}'`);
      console.log(`created role ${user}`);
    } else {
      await root.query(`ALTER ROLE "${user}" WITH LOGIN PASSWORD '${pass}'`);
    }
    await root.query(`GRANT CONNECT ON DATABASE "${db}" TO "${user}"`);
    await root.query(`GRANT TEMPORARY ON DATABASE "${db}" TO "${user}"`);
    await root.query(`ALTER DATABASE "${db}" OWNER TO "${SUPERUSER}"`);
  } finally {
    await root.end();
  }

  // Schema-level grants must run inside the target database.
  const inDb = admin(db);
  await inDb.connect();
  try {
    await inDb.query(`GRANT USAGE, CREATE ON SCHEMA public TO "${user}"`);
    await inDb.query(`GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public TO "${user}"`);
    await inDb.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${user}"`);
    await inDb.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "${user}"`);
    await inDb.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${user}"`);
    await inDb.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  } finally {
    await inDb.end();
  }
  console.log(`ensured ${db} / ${user}`);
}

async function main() {
  for (const svc of SERVICES) {
    await ensureService(svc);
  }
  console.log('ensure-dbs: all databases and roles reconciled');
}

main().catch((err) => {
  console.error('ensure-dbs failed:', err.message);
  process.exit(1);
});
