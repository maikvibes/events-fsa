import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { SeedProgressService, SeedTokensRequestedEvent } from '@app/shared';

// Bulk device-token seeder for the admin "seed the database" buttons.
// notifications-svc owns DeviceToken, so per-service seeding lives here. Tokens
// get self-generated userIds (the broadcast fanout queries DeviceToken directly,
// so they don't need to match real auth users) via UNNEST batch inserts.
@Injectable()
export class SeedService implements OnModuleDestroy {
  private readonly logger = new Logger(SeedService.name);
  private readonly pool: pg.Pool;
  private static readonly CHUNK = 10_000;
  private static readonly PLATFORMS = ['ios', 'android', 'web'] as const;

  constructor(
    config: ConfigService,
    private readonly progress: SeedProgressService,
  ) {
    this.pool = new pg.Pool({
      connectionString: config.getOrThrow<string>('NOTIFICATIONS_DATABASE_URL'),
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  // Fire-and-forget: seed in the background, reporting progress to Redis.
  start(event: SeedTokensRequestedEvent): void {
    void this.run(event).catch(async (err) => {
      this.logger.error(
        `Seed job ${event.jobId} (tokens) failed`,
        err as Error,
      );
      await this.progress.failPart(event.jobId, 'tokens');
    });
  }

  private async run(event: SeedTokensRequestedEvent): Promise<void> {
    const { jobId, count, fresh } = event;
    await this.progress.startPart(jobId, 'tokens', count);
    if (fresh) {
      await this.pool.query(
        `DELETE FROM "DeviceToken" WHERE token LIKE 'load-token-%'`,
      );
    }

    let done = 0;
    for (let offset = 0; offset < count; offset += SeedService.CHUNK) {
      const n = Math.min(SeedService.CHUNK, count - offset);
      const ids = new Array<string>(n);
      const userIds = new Array<string>(n);
      const tokens = new Array<string>(n);
      const platforms = new Array<string>(n);
      for (let j = 0; j < n; j++) {
        const i = offset + j;
        ids[j] = randomUUID();
        userIds[j] = randomUUID();
        tokens[j] = `load-token-${i}`;
        platforms[j] = SeedService.PLATFORMS[i % SeedService.PLATFORMS.length];
      }
      await this.pool.query(
        `INSERT INTO "DeviceToken" (id, "userId", token, platform, "createdAt", "updatedAt")
         SELECT t.id, t.user_id, t.token, t.platform::"Platform", NOW(), NOW()
         FROM UNNEST($1::uuid[], $2::uuid[], $3::text[], $4::text[]) AS t(id, user_id, token, platform)
         ON CONFLICT (token) DO NOTHING`,
        [ids, userIds, tokens, platforms],
      );
      done += n;
      await this.progress.advancePart(jobId, 'tokens', done);
    }

    await this.progress.finishPart(jobId, 'tokens');
    this.logger.log(`Seed job ${jobId}: ${done} device tokens seeded`);
  }
}
