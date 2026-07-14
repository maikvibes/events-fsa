import { randomUUID } from 'crypto';
import { hostname } from 'os';
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
  NotificationBroadcastBatchEvent,
  NotificationBroadcastBatchCompletedEvent,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import { NotificationStatus, Platform } from './generated/prisma-client';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  // FCM multicast caps at 500 tokens; keep DB pages aligned so one page == one
  // batch event == one sendEachForMulticast call.
  private static readonly BATCH_SIZE = 500;

  // Which worker replica this process is; stamped onto batch-completion events.
  private readonly instanceId = process.env.INSTANCE_ID ?? hostname();

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

    // Keyset-paginate the token read so a large follower list never loads every
    // token into memory at once; send each page as it arrives.
    let cursorId: string | undefined;
    const result = { sent: 0, failed: 0 };
    for (;;) {
      const page = await this.prisma.deviceToken.findMany({
        where: { userId: { in: userIds } },
        orderBy: { id: 'asc' },
        take: NotificationsService.BATCH_SIZE,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (!page.length) break;
      const pageResult = await this.sendMulticast({
        tokens: page.map((t) => t.token),
        title,
        body,
      });
      result.sent += pageResult.sent;
      result.failed += pageResult.failed;
      cursorId = page[page.length - 1].id;
      if (page.length < NotificationsService.BATCH_SIZE) break;
    }

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

  // Dispatcher: keyset-paginate the DeviceToken table and emit one batch event
  // per 500-token page. Does NOT send FCM or write logs itself — that is the
  // worker's job (onBroadcastBatch), so a broadcast to millions of recipients
  // never loads every token into one process's memory.
  async broadcast(
    dto: BroadcastDto,
  ): Promise<{ broadcastId: string; batches: number; totalTokens: number }> {
    const broadcastId = randomUUID();
    let cursorId: string | undefined;
    let batches = 0;
    let totalTokens = 0;

    for (;;) {
      const page = await this.prisma.deviceToken.findMany({
        select: { id: true, token: true, userId: true },
        orderBy: { id: 'asc' },
        take: NotificationsService.BATCH_SIZE,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (!page.length) break;

      const batchId = `${broadcastId}:${batches}`;
      const event: NotificationBroadcastBatchEvent = {
        broadcastId,
        batchId,
        title: dto.title,
        body: dto.body,
        data: dto.eventId ? { ...dto.data, eventId: dto.eventId } : dto.data,
        eventId: dto.eventId,
        tokens: page.map((t) => ({ token: t.token, userId: t.userId })),
      };
      // batchId as the Kafka key spreads batches evenly across partitions/workers.
      this.producer.emit(KafkaTopics.NOTIFICATION_BROADCAST_BATCH, {
        key: batchId,
        value: event,
      });

      batches += 1;
      totalTokens += page.length;
      cursorId = page[page.length - 1].id;
    }

    if (!batches) {
      this.logger.warn('Broadcast: no device tokens registered');
    } else {
      this.logger.log(
        `Broadcast ${broadcastId} dispatched: ${batches} batches, ${totalTokens} tokens`,
      );
    }
    return { broadcastId, batches, totalTokens };
  }

  // Worker: process one broadcast batch. One replica in the consumer group
  // handles each batch; on completion it emits a batch-completed event stamped
  // with this instance's id so the fanout can be traced across the worker pool.
  async onBroadcastBatch(
    event: NotificationBroadcastBatchEvent,
  ): Promise<void> {
    const { broadcastId, batchId, title, body, data, eventId, tokens } = event;
    if (!tokens.length) return;

    const result = await this.sendMulticast({
      tokens: tokens.map((t) => t.token),
      title,
      body,
      data,
    });

    // One log row per recipient user (not per device), matching notifyFollowers.
    await this.prisma.notificationLog.createMany({
      data: [...new Set(tokens.map((t) => t.userId))].map((userId) => ({
        userId,
        eventId,
        title,
        body,
        status: NotificationStatus.sent,
      })),
    });

    const completed: NotificationBroadcastBatchCompletedEvent = {
      broadcastId,
      batchId,
      processedBy: this.instanceId,
      sent: result.sent,
      failed: result.failed,
      completedAt: new Date(),
    };
    this.producer.emit(
      KafkaTopics.NOTIFICATION_BROADCAST_BATCH_COMPLETED,
      completed,
    );

    this.logger.log(
      `[instance ${this.instanceId}] broadcast ${broadcastId} batch ${batchId}: ${result.sent} sent, ${result.failed} failed`,
    );
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
