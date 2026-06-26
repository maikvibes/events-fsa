import * as fs from 'fs';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client!: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const useTls = (this.config.get('REDIS_TLS') || '').toLowerCase() === 'true';
    const caPath = this.config.get<string>('REDIS_TLS_CA_PATH');

    // node-redis v6: tls must be boolean true; CA + rejectUnauthorized go in socket directly
    const socket: Record<string, unknown> = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      ...(useTls && {
        tls: true,
        rejectUnauthorized: true,
        ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}),
      }),
    };

    this.client = createClient({
      socket,
      username: this.config.get('REDIS_USERNAME') || undefined,
      password: this.config.get('REDIS_PASSWORD') || undefined,
    }) as RedisClientType;

    this.client.on('error', (err) => this.logger.error('Redis error', err));
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(keys);
  }
}
