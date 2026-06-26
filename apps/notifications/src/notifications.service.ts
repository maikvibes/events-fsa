import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  SendNotificationDto,
  NotificationResult,
  EventCreatedEvent,
  KafkaTopics,
  NotificationSentEvent,
  NotificationFailedEvent,
  NOTIFICATIONS_KAFKA_PRODUCER,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import { NotificationStatus, Platform } from './generated/prisma-client';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_KAFKA_PRODUCER) private readonly producer: ClientProxy,
  ) {}

  onModuleInit() {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: this.config.getOrThrow('FIREBASE_PROJECT_ID'),
          privateKey: this.config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
          clientEmail: this.config.getOrThrow('FIREBASE_CLIENT_EMAIL'),
        }),
      });
      this.logger.log('Firebase Admin initialised');
    }
  }

  async send(dto: SendNotificationDto): Promise<NotificationResult> {
    this.logger.log(`Sending FCM to user ${dto.userId} device ...${dto.deviceToken.slice(-6)}`);
    try {
      const messageId = await getMessaging().send({
        token: dto.deviceToken,
        notification: { title: dto.title, body: dto.body },
        data: dto.data,
        android: { priority: 'high' },
        apns: {
          payload: {
            aps: { alert: { title: dto.title, body: dto.body }, sound: 'default' },
          },
        },
      });

      await this.prisma.notificationLog.create({
        data: {
          userId: dto.userId,
          eventId: dto.eventId,
          title: dto.title,
          body: dto.body,
          status: NotificationStatus.sent,
          messageId,
        },
      });

      const sentEvent: NotificationSentEvent = {
        notificationId: messageId,
        userId: dto.userId,
        eventId: dto.eventId ?? '',
        title: dto.title,
        body: dto.body,
        sentAt: new Date(),
      };
      this.producer.emit(KafkaTopics.NOTIFICATION_SENT, sentEvent);

      return { success: true, messageId };
    } catch (err) {
      const error = (err as Error).message;

      const log = await this.prisma.notificationLog.create({
        data: {
          userId: dto.userId,
          eventId: dto.eventId,
          title: dto.title,
          body: dto.body,
          status: NotificationStatus.failed,
          error,
        },
      });

      const failedEvent: NotificationFailedEvent = {
        notificationId: log.id,
        userId: dto.userId,
        eventId: dto.eventId ?? '',
        error,
        failedAt: new Date(),
      };
      this.producer.emit(KafkaTopics.NOTIFICATION_FAILED, failedEvent);

      this.logger.error(`FCM failed for user ${dto.userId}: ${error}`);
      return { success: false, error };
    }
  }

  async registerDeviceToken(userId: string, token: string, platform: Platform): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    this.logger.log(`Registered ${platform} token for user ${userId}`);
  }

  async onEventCreated(event: EventCreatedEvent): Promise<void> {
    this.logger.log(`Event ${event.eventId} created — fanning out FCM to user ${event.userId}`);
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId: event.userId } });

    if (!tokens.length) {
      this.logger.warn(`No device tokens for user ${event.userId}`);
      return;
    }

    const results = await Promise.allSettled(
      tokens.map((t) =>
        this.send({
          userId: event.userId,
          deviceToken: t.token,
          title: `New Event: ${event.title}`,
          body: event.description,
          eventId: event.eventId,
          data: { eventId: event.eventId, date: event.date.toISOString() },
        }),
      ),
    );

    const failed = results.filter(
      (r): r is PromiseFulfilledResult<NotificationResult> =>
        r.status === 'fulfilled' && !r.value.success,
    ).length + results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`FCM fan-out: ${results.length - failed}/${results.length} sent`);
  }
}
