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
  NotificationBroadcastDispatchedEvent,
  NotificationBroadcastCancelledEvent,
  ListNotificationsQueryDto,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { Prisma, NotificationStatus, Platform } from './generated/prisma-client';

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
    private readonly redis: RedisService,
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

  // Shared by the update/delete/announcement/reminder fanout paths. events-svc
  // resolved the follower userId list for us; we log it in-app and route the
  // push through the batched fanout pipeline (parallel, tracked, cancellable).
  async notifyFollowers(
    userIds: string[],
    title: string,
    body: string,
    eventId?: string,
  ): Promise<{ broadcastId: string; batches: number; totalTokens: number }> {
    if (!userIds.length) {
      return { broadcastId: '', batches: 0, totalTokens: 0 };
    }

    // Write one in-app log per follower up front — including followers with no
    // device token — so /notifications/me shows the notification even without a
    // push. The batched send then covers only followers that have a token, and
    // its workers skip logging (writeLogs=false) to avoid double entries.
    await this.prisma.notificationLog.createMany({
      data: userIds.map((userId) => ({
        userId,
        eventId,
        title,
        body,
        status: NotificationStatus.sent,
      })),
    });

    // Route the push through the same batched dispatcher → 4 workers → analytics
    // pipeline as broadcasts, so event fanouts parallelize, get tracked as runs,
    // and are cancellable.
    return this.dispatchFanout({
      broadcastId: randomUUID(),
      title,
      body,
      eventId,
      requestedBy: 'system',
      requestedAt: new Date(),
      userIds,
      writeLogs: false,
    });
  }

  async findByUser(userId: string) {
    return this.prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(query: ListNotificationsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.NotificationLogWhereInput = {};
    if (query.status) where.status = query.status as NotificationStatus;
    if (query.userId) where.userId = query.userId;
    if (query.eventId) where.eventId = query.eventId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { body: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.createdFrom || query.createdTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.createdFrom) createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) {
        // Inclusive of the whole `createdTo` day: bound by < next midnight.
        const to = new Date(query.createdTo);
        to.setDate(to.getDate() + 1);
        createdAt.lt = to;
      }
      where.createdAt = createdAt;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  // Broadcast to every registered device — the whole-audience case of a fanout.
  async broadcast(
    dto: BroadcastDto,
    meta?: { broadcastId?: string; requestedBy?: string; requestedAt?: Date },
  ): Promise<{ broadcastId: string; batches: number; totalTokens: number }> {
    return this.dispatchFanout({
      broadcastId: meta?.broadcastId ?? randomUUID(),
      title: dto.title,
      body: dto.body,
      data: dto.data,
      eventId: dto.eventId,
      requestedBy: meta?.requestedBy ?? 'system',
      requestedAt: meta?.requestedAt ?? new Date(),
      writeLogs: true,
    });
  }

  // Generic dispatcher shared by broadcasts (all devices) and event
  // follower-fanout (devices of a given userId set). Keyset-paginates the
  // DeviceToken table and emits one batch event per 500-token page; the workers
  // do the FCM send + logging, so no single process loads every token into
  // memory. Emits a dispatched event so analytics can track the run.
  private async dispatchFanout(opts: {
    broadcastId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    eventId?: string;
    requestedBy: string;
    requestedAt: Date;
    userIds?: string[]; // undefined → every device (broadcast)
    writeLogs: boolean;
  }): Promise<{ broadcastId: string; batches: number; totalTokens: number }> {
    const { broadcastId, title, body, eventId, userIds, writeLogs } = opts;
    const where = userIds ? { userId: { in: userIds } } : {};
    let cursorId: string | undefined;
    let batches = 0;
    let totalTokens = 0;

    for (;;) {
      // Cooperative cancellation: stop paging as soon as the run is cancelled so
      // no further batches are queued.
      if (await this.redis.isBroadcastCancelled(broadcastId)) {
        this.logger.warn(
          `Fanout ${broadcastId} cancelled after ${batches} batches — dispatch halted`,
        );
        break;
      }

      const page = await this.prisma.deviceToken.findMany({
        where,
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
        title,
        body,
        data: eventId ? { ...opts.data, eventId } : opts.data,
        eventId,
        tokens: page.map((t) => ({ token: t.token, userId: t.userId })),
        writeLogs,
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

    this.logger.log(
      `Fanout ${broadcastId} dispatched: ${batches} batches, ${totalTokens} tokens`,
    );

    // Tell analytics-svc the run's expected totals so it can create the run
    // record and later detect exact completion (receivedBatches === batches).
    const dispatched: NotificationBroadcastDispatchedEvent = {
      broadcastId,
      title,
      body,
      requestedBy: opts.requestedBy,
      requestedAt: opts.requestedAt,
      batches,
      totalTokens,
      dispatchedAt: new Date(),
    };
    this.producer.emit(
      KafkaTopics.NOTIFICATION_BROADCAST_DISPATCHED,
      dispatched,
    );

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

    // Cooperative cancellation: skip the FCM send for any batch not yet
    // processed once the run is cancelled. Already-sent batches can't be recalled.
    if (await this.redis.isBroadcastCancelled(broadcastId)) {
      this.logger.warn(
        `[instance ${this.instanceId}] skipping cancelled fanout ${broadcastId} batch ${batchId}`,
      );
      return;
    }

    const result = await this.sendMulticast({
      tokens: tokens.map((t) => t.token),
      title,
      body,
      data,
    });

    // One log row per recipient user (not per device). Skipped for event
    // follower-fanout, which already wrote per-follower logs up front.
    if (event.writeLogs !== false) {
      await this.prisma.notificationLog.createMany({
        data: [...new Set(tokens.map((t) => t.userId))].map((userId) => ({
          userId,
          eventId,
          title,
          body,
          status: NotificationStatus.sent,
        })),
      });
    }

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

  // Set the shared cancel flag so the dispatcher + every worker stop sending
  // this broadcast. The gateway emits the cancelled event; analytics consumes
  // the same event to mark the run.
  async cancelBroadcast(
    event: NotificationBroadcastCancelledEvent,
  ): Promise<void> {
    await this.redis.markBroadcastCancelled(event.broadcastId);
    this.logger.warn(
      `Broadcast ${event.broadcastId} cancelled by ${event.cancelledBy}`,
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
