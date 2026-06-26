import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  AuthPatterns,
  EventsPatterns,
  NotificationsPatterns,
  RegisterDto,
  LoginDto,
  CreateEventDto,
  UpdateEventDto,
  SendNotificationDto,
} from '@app/shared';

@Injectable()
export class ApiGatewayService {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
    @Inject(EVENTS_SERVICE) private readonly eventsClient: ClientProxy,
    @Inject(NOTIFICATIONS_SERVICE) private readonly notificationsClient: ClientProxy,
  ) {}

  register(dto: RegisterDto) {
    return firstValueFrom(this.authClient.send(AuthPatterns.REGISTER, dto));
  }

  login(dto: LoginDto) {
    return firstValueFrom(this.authClient.send(AuthPatterns.LOGIN, dto));
  }

  createEvent(dto: CreateEventDto) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.CREATE, dto));
  }

  findEventsByUser(userId: string) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.FIND_ALL, { userId }));
  }

  findEvent(eventId: string) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.FIND_ONE, { eventId }));
  }

  updateEvent(dto: UpdateEventDto) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.UPDATE, dto));
  }

  deleteEvent(eventId: string, userId: string) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.DELETE, { eventId, userId }));
  }

  sendNotification(dto: SendNotificationDto) {
    return firstValueFrom(this.notificationsClient.send(NotificationsPatterns.SEND, dto));
  }

  registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android' | 'web') {
    return firstValueFrom(
      this.notificationsClient.send('notifications.register-token', { userId, token, platform }),
    );
  }
}
