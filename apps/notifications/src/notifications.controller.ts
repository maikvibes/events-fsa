import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { NotificationsPatterns, KafkaTopics } from '@app/shared';
import type {
  SendNotificationDto,
  SendToUserDto,
  SendMulticastDto,
  EventCreatedEvent,
  BroadcastDto,
  NotificationBroadcastEvent,
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
    });
  }
}
