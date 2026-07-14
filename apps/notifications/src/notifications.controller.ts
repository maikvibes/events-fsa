import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { NotificationsPatterns, KafkaTopics } from '@app/shared';
import type {
  SendNotificationDto,
  SendToUserDto,
  SendMulticastDto,
  EventCreatedEvent,
  EventFollowerNotifyEvent,
  BroadcastDto,
  NotificationBroadcastEvent,
  NotificationBroadcastBatchEvent,
} from '@app/shared';
import type { Platform } from './generated/prisma-client';

interface RegisterDeviceTokenDto {
  userId: string;
  token: string;
  platform: Platform;
}

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @MessagePattern(NotificationsPatterns.SEND)
  send(@Payload() dto: SendNotificationDto) {
    return this.notificationsService.send(dto);
  }

  @MessagePattern(NotificationsPatterns.SEND_TO_USER)
  sendToUser(@Payload() dto: SendToUserDto) {
    return this.notificationsService.sendToUser(dto);
  }

  @MessagePattern(NotificationsPatterns.MULTICAST)
  sendMulticast(@Payload() dto: SendMulticastDto) {
    return this.notificationsService.sendMulticast(dto);
  }

  @MessagePattern(NotificationsPatterns.BROADCAST)
  sendBroadcast(@Payload() dto: BroadcastDto) {
    return this.notificationsService.broadcast(dto);
  }

  @MessagePattern('notifications.register-token')
  registerToken(@Payload() dto: RegisterDeviceTokenDto) {
    return this.notificationsService.registerDeviceToken(
      dto.userId,
      dto.token,
      dto.platform,
    );
  }

  @EventPattern(KafkaTopics.EVENT_CREATED)
  onEventCreated(@Payload() event: EventCreatedEvent) {
    return this.notificationsService.onEventCreated(event);
  }

  // Async broadcast: an admin fired this via the gateway (which already returned
  // 202). Fan out to every device token in FCM multicast batches of 500.
  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST)
  onBroadcast(@Payload() event: NotificationBroadcastEvent) {
    return this.notificationsService.broadcast({
      title: event.title,
      body: event.body,
      data: event.data,
      eventId: event.eventId,
    });
  }

  // Worker: one replica in the consumer group picks up each batch, fans it out
  // via FCM multicast, and emits a completion event stamped with its instance id.
  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST_BATCH)
  onBroadcastBatch(@Payload() event: NotificationBroadcastBatchEvent) {
    return this.notificationsService.onBroadcastBatch(event);
  }

  // Follower fanout — events-svc resolved followerUserIds itself (it owns the
  // EventFollow table), we just need to push and log.
  @EventPattern(KafkaTopics.EVENT_UPDATED_FOR_FOLLOWERS)
  onEventUpdatedForFollowers(@Payload() event: EventFollowerNotifyEvent) {
    return this.notificationsService.notifyFollowers(
      event.followerUserIds,
      event.title,
      event.body,
      event.eventId,
    );
  }

  @EventPattern(KafkaTopics.EVENT_DELETED_FOR_FOLLOWERS)
  onEventDeletedForFollowers(@Payload() event: EventFollowerNotifyEvent) {
    return this.notificationsService.notifyFollowers(
      event.followerUserIds,
      event.title,
      event.body,
      event.eventId,
    );
  }

  @EventPattern(KafkaTopics.EVENT_ANNOUNCEMENT)
  onEventAnnouncement(@Payload() event: EventFollowerNotifyEvent) {
    return this.notificationsService.notifyFollowers(
      event.followerUserIds,
      event.title,
      event.body,
      event.eventId,
    );
  }

  @EventPattern(KafkaTopics.EVENT_REMINDER_DUE)
  onEventReminderDue(@Payload() event: EventFollowerNotifyEvent) {
    return this.notificationsService.notifyFollowers(
      event.followerUserIds,
      event.title,
      event.body,
      event.eventId,
    );
  }

  @MessagePattern(NotificationsPatterns.FIND_BY_USER)
  findByUser(@Payload() dto: { userId: string }) {
    return this.notificationsService.findByUser(dto.userId);
  }

  @MessagePattern(NotificationsPatterns.FIND_ALL)
  findAll() {
    return this.notificationsService.findAll();
  }
}
