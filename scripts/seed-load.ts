// Load-test seeder: bulk-inserts N users (auth DB) and one device token per
// user (notifications DB) so the batched broadcast fanout has real recipients.
//
// This is a dev/load-test tool, NOT app code, and is deliberately separate from
// the idempotent scripts/seed.ts. It uses UNNEST-based bulk inserts (one array
// param per column) to approach COPY throughput without extra dependencies.
//
// Run with:
//   node --env-file=.env -r ts-node/register/transpile-only scripts/seed-load.ts [count] [--fresh]
// Defaults: count = 1_000_000. --fresh deletes prior load-seed rows first.
import * as crypto from 'crypto';
import pg from 'pg';

const DEFAULT_COUNT = 1_000_000;
const CHUNK = 10_000; // rows per bulk statement
const PLATFORMS = ['ios', 'android', 'web'] as const;

// Mirrors AuthService.hashPassword / scripts/seed.ts so seeded accounts can log
// in via POST /auth/login. One shared hash is reused for every account.
function hashPassword(plain: string, jwtSecret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHmac('sha256', jwtSecret)
    .update(plain + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const count = Number(args.find((a) => /^\d+$/.test(a)) ?? DEFAULT_COUNT);

  const jwtSecret = process.env.JWT_SECRET;
  const authUrl = process.env.AUTH_DATABASE_URL;
  const notifUrl = process.env.NOTIFICATIONS_DATABASE_URL;
  if (!jwtSecret || !authUrl || !notifUrl) {
    throw new Error(
      'JWT_SECRET, AUTH_DATABASE_URL, and NOTIFICATIONS_DATABASE_URL must be set (run via `node --env-file=.env ...`)',
    );
  }

  const authPool = new pg.Pool({ connectionString: authUrl });
  const notifPool = new pg.Pool({ connectionString: notifUrl });
  const password = hashPassword('Seed-Pass123', jwtSecret);

  try {
    if (fresh) {
      const u = await authPool.query(
        `DELETE FROM "User" WHERE email LIKE 'load+%@eventfsa.local'`,
      );
      const t = await notifPool.query(
        `DELETE FROM "DeviceToken" WHERE token LIKE 'load-token-%'`,
      );
      console.log(`--fresh: removed ${u.rowCount} users, ${t.rowCount} tokens`);
    }

    console.log(`Seeding ${count} users + device tokens (chunk ${CHUNK})...`);
    const start = Date.now();

    for (let offset = 0; offset < count; offset += CHUNK) {
      const n = Math.min(CHUNK, count - offset);
      const ids: string[] = new Array(n);
      const emails: string[] = new Array(n);
      const names: string[] = new Array(n);
      const tokenIds: string[] = new Array(n);
      const tokens: string[] = new Array(n);
      const platforms: string[] = new Array(n);

      for (let j = 0; j < n; j++) {
        const i = offset + j;
        ids[j] = crypto.randomUUID();
        emails[j] = `load+${i}@eventfsa.local`;
        names[j] = `Load User ${i}`;
        tokenIds[j] = crypto.randomUUID();
        tokens[j] = `load-token-${i}`;
        platforms[j] = PLATFORMS[i % PLATFORMS.length];
      }

      // Users. role/timestamps are constants in the SELECT so only the varying
      // columns travel as arrays.
      await authPool.query(
        `INSERT INTO "User" (id, email, name, password, role, "createdAt", "updatedAt")
         SELECT u.id, u.email, u.name, $4, 'user'::"Role", NOW(), NOW()
         FROM UNNEST($1::uuid[], $2::text[], $3::text[]) AS u(id, email, name)
         ON CONFLICT (email) DO NOTHING`,
        [ids, emails, names, password],
      );

      // Device tokens — userId matches the user id generated above.
      await notifPool.query(
        `INSERT INTO "DeviceToken" (id, "userId", token, platform, "createdAt", "updatedAt")
         SELECT t.id, t.user_id, t.token, t.platform::"Platform", NOW(), NOW()
         FROM UNNEST($1::uuid[], $2::uuid[], $3::text[], $4::text[]) AS t(id, user_id, token, platform)
         ON CONFLICT (token) DO NOTHING`,
        [tokenIds, ids, tokens, platforms],
      );

      const done = offset + n;
      if (done % (CHUNK * 10) === 0 || done === count) {
        const rate = Math.round(done / ((Date.now() - start) / 1000));
        console.log(`  ${done}/${count} (${rate} rows/s)`);
      }
    }

    console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } finally {
    await authPool.end();
    await notifPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
