// Idempotent seed data for local/dev use: a handful of users, events, and
// follows so the mobile app and web admin have something to show immediately
// after a fresh deploy. Safe to re-run — every write is an upsert or guarded
// by an existence check.
//
// Run with: node --env-file=.env -r ts-node/register/transpile-only scripts/seed.ts
import * as crypto from 'crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as AuthPrismaClient } from '../apps/auth/src/generated/prisma-client';
import { PrismaClient as EventsPrismaClient } from '../apps/events/src/generated/prisma-client';

// Mirrors AuthService's private hashPassword — must match exactly so the
// seeded accounts can actually log in via POST /auth/login.
function hashPassword(plain: string, jwtSecret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHmac('sha256', jwtSecret)
    .update(plain + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const jwtSecret = process.env.JWT_SECRET;
  const authUrl = process.env.AUTH_DATABASE_URL;
  const eventsUrl = process.env.EVENTS_DATABASE_URL;
  if (!jwtSecret || !authUrl || !eventsUrl) {
    throw new Error(
      'JWT_SECRET, AUTH_DATABASE_URL, and EVENTS_DATABASE_URL must be set (run via `node --env-file=.env ...`)',
    );
  }

  const authDb = new AuthPrismaClient({
    adapter: new PrismaPg(new pg.Pool({ connectionString: authUrl })),
  });
  const eventsDb = new EventsPrismaClient({
    adapter: new PrismaPg(new pg.Pool({ connectionString: eventsUrl })),
  });

  try {
    const seedPassword = hashPassword('Seed-Pass123', jwtSecret);

    const users = await Promise.all(
      [
        { email: 'admin@eventfsa.local', name: 'Seed Admin' },
        { email: 'alice@eventfsa.local', name: 'Alice' },
        { email: 'bob@eventfsa.local', name: 'Bob' },
      ].map((u) =>
        authDb.user.upsert({
          where: { email: u.email },
          create: { ...u, password: seedPassword },
          update: {},
        }),
      ),
    );
    const [admin, alice, bob] = users;
    console.log(`Users: ${users.map((u) => u.email).join(', ')}`);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const eventDefs = [
      {
        title: 'Kickoff Retro',
        description: 'Looking back at last quarter.',
        date: new Date(now - 30 * day),
      },
      {
        title: 'Weekly Standup',
        description: 'Regular team sync.',
        date: new Date(now + 2 * day),
      },
      {
        title: 'Product Launch',
        description: 'Public launch event for the new release.',
        date: new Date(now + 5 * day),
      },
      {
        title: 'Summer Conference',
        description: 'Annual industry conference.',
        date: new Date(now + 60 * day),
      },
      {
        title: 'Hackathon',
        description: '48-hour build sprint.',
        date: new Date(now + 90 * day),
      },
      {
        title: 'Year-End Party',
        description: 'Celebrating the year.',
        date: new Date(now + 200 * day),
      },
    ];

    const events = [];
    for (const def of eventDefs) {
      const existing = await eventsDb.event.findFirst({
        where: { title: def.title },
      });
      events.push(
        existing ??
          (await eventsDb.event.create({
            data: { ...def, userId: admin.id },
          })),
      );
    }
    console.log(`Events: ${events.map((e) => e.title).join(', ')}`);

    // Alice follows the first three, Bob follows the last three — gives both
    // seeded users a non-empty "My events" list from different angles.
    const follows = [
      ...events.slice(0, 3).map((e) => ({ userId: alice.id, eventId: e.id })),
      ...events.slice(3).map((e) => ({ userId: bob.id, eventId: e.id })),
    ];
    for (const f of follows) {
      await eventsDb.eventFollow.upsert({
        where: { userId_eventId: f },
        create: f,
        update: {},
      });
    }
    console.log(`Follows: ${follows.length} seeded`);
  } finally {
    await authDb.$disconnect();
    await eventsDb.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
