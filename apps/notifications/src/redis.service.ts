import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { CacheKeys, CacheTTL } from '@app/shared';

// Shared cancellation flag for in-flight broadcasts. The dispatcher checks it
// between token pages and each worker checks it before sending a batch, so an
// admin can stop a fanout across all 4 replicas.
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
      },
    });
    this.client.on('error', (err) => this.logger.error('Redis error', err));
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async markBroadcastCancelled(broadcastId: string): Promise<void> {
    await this.client.set(CacheKeys.BROADCAST_CANCEL(broadcastId), '1', {
      EX: CacheTTL.BROADCAST_CANCEL,
    });
  }

  async isBroadcastCancelled(broadcastId: string): Promise<boolean> {
    return (await this.client.exists(CacheKeys.BROADCAST_CANCEL(broadcastId))) === 1;
  }
}
