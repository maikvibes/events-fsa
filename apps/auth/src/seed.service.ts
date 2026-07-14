import { randomUUID, createHmac, randomBytes } from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { SeedProgressService } from '@app/shared';

// Bulk user seeder for the admin "seed the database" buttons. Owns the User
// table (auth-svc), so per-service seeding lives here. Uses a dedicated pg pool
// with UNNEST batch inserts (COPY-like throughput) rather than the ORM.
@Injectable()
export class SeedService implements OnModuleDestroy {
  private readonly logger = new Logger(SeedService.name);
  private readonly pool: pg.Pool;
  private readonly password: string;

  private static readonly CHUNK = 10_000;

  constructor(
    config: ConfigService,
    private readonly progress: SeedProgressService,
  ) {
    this.pool = new pg.Pool({
      connectionString: config.getOrThrow<string>('AUTH_DATABASE_URL'),
    });
    // One shared login-able hash for every seeded user (matches AuthService).
    const salt = randomBytes(16).toString('hex');
    const hash = createHmac('sha256', config.getOrThrow<string>('JWT_SECRET'))
      .update('Seed-Pass123' + salt)
      .digest('hex');
    this.password = `${salt}:${hash}`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  // Fire-and-forget: kicks off seeding in the background and reports progress to
  // Redis. The caller (gateway → gRPC) returns immediately.
  start(jobId: string, count: number, fresh: boolean): void {
    void this.run(jobId, count, fresh).catch(async (err) => {
      this.logger.error(`Seed job ${jobId} (users) failed`, err as Error);
      await this.progress.failPart(jobId, 'users');
    });
  }

  private async run(
    jobId: string,
    count: number,
    fresh: boolean,
  ): Promise<void> {
    await this.progress.startPart(jobId, 'users', count);
    if (fresh) {
      await this.pool.query(
        `DELETE FROM "User" WHERE email LIKE 'load+%@eventfsa.local'`,
      );
    }

    let done = 0;
    for (let offset = 0; offset < count; offset += SeedService.CHUNK) {
      const n = Math.min(SeedService.CHUNK, count - offset);
      const ids = new Array<string>(n);
      const emails = new Array<string>(n);
      const names = new Array<string>(n);
      for (let j = 0; j < n; j++) {
        const i = offset + j;
        ids[j] = randomUUID();
        emails[j] = `load+${i}@eventfsa.local`;
        names[j] = `Load User ${i}`;
      }
      await this.pool.query(
        `INSERT INTO "User" (id, email, name, password, role, "createdAt", "updatedAt")
         SELECT u.id, u.email, u.name, $4, 'user'::"Role", NOW(), NOW()
         FROM UNNEST($1::uuid[], $2::text[], $3::text[]) AS u(id, email, name)
         ON CONFLICT (email) DO NOTHING`,
        [ids, emails, names, this.password],
      );
      done += n;
      await this.progress.advancePart(jobId, 'users', done);
    }

    await this.progress.finishPart(jobId, 'users');
    this.logger.log(`Seed job ${jobId}: ${done} users seeded`);
  }
}
