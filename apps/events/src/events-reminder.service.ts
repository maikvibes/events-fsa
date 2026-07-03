import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import {
  KafkaTopics,
  EventFollowerNotifyEvent,
  EVENTS_KAFKA_PRODUCER,
} from '@app/shared';
import { PrismaService } from './prisma.service';

// One-shot reminder ~24h before an event's date. reminderSentAt guards against
// sending it twice across cron runs.
@Injectable()
export class EventsReminderService {
  private readonly logger = new Logger(EventsReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENTS_KAFKA_PRODUCER) private readonly producer: ClientProxy,
  ) {}

  @Cron('*/15 * * * *')
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000,
    );
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const dueEvents = await this.prisma.event.findMany({
      where: {
        date: { gte: windowStart, lte: windowEnd },
        reminderSentAt: null,
      },
      include: { follows: { select: { userId: true } } },
    });

    for (const event of dueEvents) {
      const followerUserIds = event.follows.map((f) => f.userId);
      if (followerUserIds.length) {
        const payload: EventFollowerNotifyEvent = {
          eventId: event.id,
          title: `Reminder: ${event.title} is tomorrow`,
          body: event.description,
          followerUserIds,
        };
        this.producer.emit(KafkaTopics.EVENT_REMINDER_DUE, payload);
      }

      await this.prisma.event.update({
        where: { id: event.id },
        data: { reminderSentAt: now },
      });
    }

    if (dueEvents.length) {
      this.logger.log(`Sent ${dueEvents.length} 24h reminder(s)`);
    }
  }
}
