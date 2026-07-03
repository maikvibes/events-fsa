import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, type BatchResponse } from 'firebase-admin/messaging';
import {
  SendNotificationDto,
  SendToUserDto,
  NotificationResult,
  EventCreatedEvent,
  KafkaTopics,
  NotificationSentEvent,
  NotificationFailedEvent,
  NOTIFICATIONS_KAFKA_PRODUCER,
  SendMulticastDto,
  BroadcastDto,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import { NotificationStatus, Platform } from './generated/prisma-client';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_KAFKA_PRODUCER)
    private readonly producer: ClientProxy,
  ) {}

  onModuleInit() {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: this.config.getOrThrow('FIREBASE_PROJECT_ID'),
          privateKey: this.config
            .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
            .replace(/\\n/g, '\n'),
          clientEmail: this.config.getOrThrow('FIREBASE_CLIENT_EMAIL'),
        }),
      });
      this.logger.log('Firebase Admin initialised');
    }
  }

  async send(dto: SendNotificationDto): Promise<NotificationResult> {
    this.logger.log(
      `Sending FCM to user ${dto.userId} device ...${dto.deviceToken.slice(-6)}`,
    );
    try {
      const messageId = await getMessaging().send({
        token: dto.deviceToken,
        notification: { title: dto.title, body: dto.body },
        data: dto.data,
        android: { priority: 'high' },
        apns: {
          payload: {
            aps: {
              alert: { title: dto.title, body: dto.body },
              sound: 'default',
            },
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

  // Send to every device a given user has registered. Resolves tokens from the DB
  // so the caller only needs the recipient's userId, never a raw FCM token.
  async sendToUser(
    dto: SendToUserDto,
  ): Promise<{ sent: number; failed: number }> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: dto.userId },
    });
    if (!tokens.length) {
      this.logger.warn(`No device tokens for user ${dto.userId}`);
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      tokens.map((t) =>
        this.send({
          userId: dto.userId,
          deviceToken: t.token,
          title: dto.title,
          body: dto.body,
          data: dto.data,
          eventId: dto.eventId,
        }),
      ),
    );

    const failed =
      results.filter(
        (r): r is PromiseFulfilledResult<NotificationResult> =>
          r.status === 'fulfilled' && !r.value.success,
      ).length + results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Send-to-user ${dto.userId}: ${results.length - failed}/${results.length} sent`,
    );
    return { sent: results.length - failed, failed };
  }

  async sendMulticast(
    dto: SendMulticastDto,
  ): Promise<{ sent: number; failed: number }> {
    const { tokens, title, body, data } = dto;
    if (!tokens.length) return { sent: 0, failed: 0 };

    let sent = 0;
    const deadTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res: BatchResponse = await (
        getMessaging().sendEachForMulticast as (m: {
          tokens: string[];
          notification: { title: string; body: string };
          data?: Record<string, string>;
          android: { priority: 'high' };
          apns: object;
        }) => Promise<BatchResponse>
      )({
        tokens: chunk,
        notification: { title, body },
        data,
        android: { priority: 'high' },
        apns: {
          payload: { aps: { alert: { title, body }, sound: 'default' } },
        },
      });

      sent += res.successCount;
      res.responses.forEach((r, idx) => {
        if (
          !r.success &&
          (r.error?.code === 'messaging/registration-token-not-registered' ||
            r.error?.code === 'messaging/invalid-registration-token')
        ) {
          deadTokens.push(chunk[idx]);
        }
      });
    }

    if (deadTokens.length) {
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      this.logger.warn(`Removed ${deadTokens.length} dead device tokens`);
    }

    const failed = tokens.length - sent;
    this.logger.log(`FCM multicast: ${sent}/${tokens.length} sent`);
    return { sent, failed };
  }

  // Shared by the update/delete/announcement/reminder fanout paths — resolves
  // every follower's device tokens in one query, since we already have the
  // userId list (events-svc resolved it, we can't query its DB ourselves).
  async notifyFollowers(
    userIds: string[],
    title: string,
    body: string,
    eventId?: string,
  ): Promise<{ sent: number; failed: number }> {
    if (!userIds.length) return { sent: 0, failed: 0 };

    const deviceTokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
    });
    const tokens = deviceTokens.map((t) => t.token);
    const result = tokens.length
      ? await this.sendMulticast({ tokens, title, body })
      : { sent: 0, failed: 0 };

    // One log row per follower (not per device) so /notifications/me shows a
    // single entry per notification.
    await this.prisma.notificationLog.createMany({
      data: userIds.map((userId) => ({
        userId,
        eventId,
        title,
        body,
        status: NotificationStatus.sent,
      })),
    });

    return result;
  }

  async findByUser(userId: string) {
    return this.prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(limit = 200) {
    return this.prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async broadcast(
    dto: BroadcastDto,
  ): Promise<{ sent: number; failed: number }> {
    const all = await this.prisma.deviceToken.findMany({
      select: { token: true, userId: true },
    });
    if (!all.length) {
      this.logger.warn('Broadcast: no device tokens registered');
      return { sent: 0, failed: 0 };
    }

    const tokens = all.map((t) => t.token);
    const userIds = [...new Set(all.map((t) => t.userId))];
    const data = dto.eventId ? { ...dto.data, eventId: dto.eventId } : dto.data;

    const result = await this.sendMulticast({
      tokens,
      title: dto.title,
      body: dto.body,
      data,
    });

    // One log row per recipient user (not per device), matching notifyFollowers.
    await this.prisma.notificationLog.createMany({
      data: userIds.map((userId) => ({
        userId,
        eventId: dto.eventId,
        title: dto.title,
        body: dto.body,
        status: NotificationStatus.sent,
      })),
    });

    return result;
  }

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: Platform,
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    this.logger.log(`Registered ${platform} token for user ${userId}`);
  }

  async onEventCreated(event: EventCreatedEvent): Promise<void> {
    this.logger.log(
      `Event ${event.eventId} created — fanning out FCM to user ${event.userId}`,
    );
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: event.userId },
    });

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

    const failed =
      results.filter(
        (r): r is PromiseFulfilledResult<NotificationResult> =>
          r.status === 'fulfilled' && !r.value.success,
      ).length + results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `FCM fan-out: ${results.length - failed}/${results.length} sent`,
    );
  }
}
