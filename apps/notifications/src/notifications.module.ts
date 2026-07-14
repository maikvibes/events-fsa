import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { SeedService } from './seed.service';
import {
  NOTIFICATIONS_KAFKA_PRODUCER,
  kafkaClientConfig,
  SeedProgressService,
} from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([kafkaClientConfig(NOTIFICATIONS_KAFKA_PRODUCER)]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PrismaService,
    RedisService,
    SeedService,
    SeedProgressService,
  ],
})
export class NotificationsModule {}
