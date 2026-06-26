import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from './generated/prisma-client';
import { pgSslConfig } from '@app/shared/tls-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const ssl = pgSslConfig();
    const pool = new pg.Pool({
      connectionString: config.getOrThrow('NOTIFICATIONS_DATABASE_URL'),
      ...(ssl !== undefined ? { ssl } : {}),
    });
    super({ adapter: new PrismaPg(pool) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
