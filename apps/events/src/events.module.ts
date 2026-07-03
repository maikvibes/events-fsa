import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsReminderService } from './events-reminder.service';
import { PrismaService } from './prisma.service';
import { RedisCacheService } from './redis-cache.service';
import { EVENTS_KAFKA_PRODUCER, kafkaClientConfig } from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ClientsModule.register([kafkaClientConfig(EVENTS_KAFKA_PRODUCER)]),
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsReminderService,
    PrismaService,
    RedisCacheService,
  ],
})
export class EventsModule {}
