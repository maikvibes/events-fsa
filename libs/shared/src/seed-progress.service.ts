import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import {
  SeedKeys,
  SEED_JOB_TTL,
  SeedJobProgress,
  SeedPartName,
  SeedPartProgress,
} from './seed.contracts';

// Shared read/write for the seed:job:<jobId> progress hash. Writers: auth-svc
// (users) and notifications-svc (tokens). Reader: the gateway, polled by the UI.
@Injectable()
export class SeedProgressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeedProgressService.name);
  private client!: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
      },
    });
    this.client.on('error', (err) =>
      this.logger.error('Redis error', err as Error),
    );
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async startPart(
    jobId: string,
    part: SeedPartName,
    total: number,
  ): Promise<void> {
    const key = SeedKeys.JOB(jobId);
    await this.client.hSet(key, {
      [`${part}_total`]: String(total),
      [`${part}_done`]: '0',
      [`${part}_status`]: 'running',
      startedAt: (await this.client.hGet(key, 'startedAt')) ?? nowIso(),
    });
    await this.client.expire(key, SEED_JOB_TTL);
  }

  async advancePart(
    jobId: string,
    part: SeedPartName,
    done: number,
  ): Promise<void> {
    await this.client.hSet(SeedKeys.JOB(jobId), `${part}_done`, String(done));
  }

  async finishPart(jobId: string, part: SeedPartName): Promise<void> {
    await this.client.hSet(SeedKeys.JOB(jobId), `${part}_status`, 'done');
  }

  async failPart(jobId: string, part: SeedPartName): Promise<void> {
    await this.client.hSet(SeedKeys.JOB(jobId), `${part}_status`, 'error');
  }

  async get(jobId: string): Promise<SeedJobProgress | null> {
    const h = await this.client.hGetAll(SeedKeys.JOB(jobId));
    if (!h || Object.keys(h).length === 0) return null;
    const users = readPart(h, 'users');
    const tokens = readPart(h, 'tokens');
    return {
      jobId,
      users,
      tokens,
      startedAt: h.startedAt ?? null,
      finished: isTerminal(users.status) && isTerminal(tokens.status),
    };
  }
}

function nowIso(): string {
  // new Date() is unavailable in some runtimes we run under; ISO from epoch is
  // fine here — this is a display timestamp only.
  return new Date().toISOString();
}

function isTerminal(status: SeedPartProgress['status']): boolean {
  return status === 'done' || status === 'error';
}

function readPart(
  h: Record<string, string>,
  part: SeedPartName,
): SeedPartProgress {
  const status =
    (h[`${part}_status`] as SeedPartProgress['status']) ?? 'running';
  return {
    done: Number(h[`${part}_done`] ?? 0),
    total: Number(h[`${part}_total`] ?? 0),
    // A part with no total recorded yet hasn't started; treat as running/0.
    status: h[`${part}_status`] ? status : 'running',
  };
}
