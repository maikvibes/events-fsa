import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { NotificationsPatterns, KafkaTopics } from '@app/shared';
import type { SendNotificationDto, SendMulticastDto, EventCreatedEvent, BroadcastDto } from '@app/shared';
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

  @MessagePattern(NotificationsPatterns.MULTICAST)
  sendMulticast(@Payload() dto: SendMulticastDto) {
    return this.notificationsService.sendMulticast(dto);
  }
  
  @MessagePattern(NotificationsPatterns.BROADCAST)
  sendBroadcast(@Payload() dto : BroadcastDto){
    return this.notificationsService.broadcast(dto)
  }

  @MessagePattern('notifications.register-token')
  registerToken(@Payload() dto: RegisterDeviceTokenDto) {
    return this.notificationsService.registerDeviceToken(dto.userId, dto.token, dto.platform);
  }

  @EventPattern(KafkaTopics.EVENT_CREATED)
  onEventCreated(@Payload() event: EventCreatedEvent) {
    return this.notificationsService.onEventCreated(event);
  }
}
