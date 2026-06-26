import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaService } from './prisma.service';
import { RedisCacheService } from './redis-cache.service';
import { EVENTS_KAFKA_PRODUCER, kafkaClientConfig } from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([kafkaClientConfig(EVENTS_KAFKA_PRODUCER)]),
  ],
  controllers: [EventsController],
  providers: [EventsService, PrismaService, RedisCacheService],
})
export class EventsModule {}
