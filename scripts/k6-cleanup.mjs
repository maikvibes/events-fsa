// Deletes k6 load-test data (users matching k6-*@test.local, plus their
// events/device-tokens/notification-logs in the other two databases).
// Run with: npm run k6:cleanup (loads .env via `node --env-file=.env`)
import pg from 'pg';

const K6_EMAIL_PATTERN = 'k6-%@test.local';

async function withPool(connectionString, fn) {
  const pool = new pg.Pool({ connectionString });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function main() {
  const authUrl = process.env.AUTH_DATABASE_URL;
  const eventsUrl = process.env.EVENTS_DATABASE_URL;
  const notificationsUrl = process.env.NOTIFICATIONS_DATABASE_URL;

  if (!authUrl || !eventsUrl || !notificationsUrl) {
    console.error('Missing AUTH_DATABASE_URL / EVENTS_DATABASE_URL / NOTIFICATIONS_DATABASE_URL in env.');
    process.exit(1);
  }

  const userIds = await withPool(authUrl, async (pool) => {
    const { rows } = await pool.query('SELECT id FROM "User" WHERE email LIKE $1', [K6_EMAIL_PATTERN]);
    return rows.map((r) => r.id);
  });

  console.log(`Found ${userIds.length} k6 test user(s).`);
  if (userIds.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  const eventsDeleted = await withPool(eventsUrl, async (pool) => {
    const { rowCount } = await pool.query('DELETE FROM "Event" WHERE "userId" = ANY($1)', [userIds]);
    return rowCount;
  });

  const { tokensDeleted, logsDeleted } = await withPool(notificationsUrl, async (pool) => {
    const tokens = await pool.query('DELETE FROM "DeviceToken" WHERE "userId" = ANY($1)', [userIds]);
    const logs = await pool.query('DELETE FROM "NotificationLog" WHERE "userId" = ANY($1)', [userIds]);
    return { tokensDeleted: tokens.rowCount, logsDeleted: logs.rowCount };
  });

  // RefreshToken rows cascade automatically via the FK's onDelete: Cascade.
  const usersDeleted = await withPool(authUrl, async (pool) => {
    const { rowCount } = await pool.query('DELETE FROM "User" WHERE email LIKE $1', [K6_EMAIL_PATTERN]);
    return rowCount;
  });

  console.log(`Deleted: ${usersDeleted} user(s), ${eventsDeleted} event(s), ${tokensDeleted} device token(s), ${logsDeleted} notification log(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
