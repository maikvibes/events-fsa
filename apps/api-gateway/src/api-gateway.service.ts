import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
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
export class ApiGatewayService implements OnModuleInit {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientKafka,
    @Inject(EVENTS_SERVICE) private readonly eventsClient: ClientKafka,
    @Inject(NOTIFICATIONS_SERVICE) private readonly notificationsClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.authClient.subscribeToResponseOf(AuthPatterns.REGISTER);
    this.authClient.subscribeToResponseOf(AuthPatterns.LOGIN);
    this.authClient.subscribeToResponseOf(AuthPatterns.VALIDATE_TOKEN);

    this.eventsClient.subscribeToResponseOf(EventsPatterns.CREATE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.FIND_ALL);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.FIND_ONE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.UPDATE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.DELETE);

    this.notificationsClient.subscribeToResponseOf(NotificationsPatterns.SEND);
    this.notificationsClient.subscribeToResponseOf('notifications.register-token');

    await Promise.all([
      this.authClient.connect(),
      this.eventsClient.connect(),
      this.notificationsClient.connect(),
    ]);
  }

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
