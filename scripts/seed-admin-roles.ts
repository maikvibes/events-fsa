// One-time cutover helper: promotes users whose email is in ADMIN_EMAILS to
// role='admin'. Safe to re-run — a no-op for users already at that role.
//
// Run with: node --env-file=.env -r ts-node/register/transpile-only scripts/seed-admin-roles.ts
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as AuthPrismaClient } from '../apps/auth/src/generated/prisma-client';

async function main() {
  const authUrl = process.env.AUTH_DATABASE_URL;
  if (!authUrl) {
    throw new Error(
      'AUTH_DATABASE_URL must be set (run via `node --env-file=.env ...`)',
    );
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.log('ADMIN_EMAILS is empty — nothing to seed.');
    return;
  }

  const authDb = new AuthPrismaClient({
    adapter: new PrismaPg(new pg.Pool({ connectionString: authUrl })),
  });

  try {
    const result = await authDb.user.updateMany({
      where: {
        OR: adminEmails.map((email) => ({
          email: { equals: email, mode: 'insensitive' as const },
        })),
      },
      data: { role: 'admin' },
    });
    console.log(
      `Promoted ${result.count} user(s) to admin: ${adminEmails.join(', ')}`,
    );
  } finally {
    await authDb.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
