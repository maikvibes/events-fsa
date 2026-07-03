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
  KafkaTopics,
  RegisterDto,
  LoginDto,
  CreateEventDto,
  UpdateEventDto,
  AnnounceEventDto,
  SendToUserDto,
  BroadcastDto,
  NotificationBroadcastEvent,
  ListUsersQueryDto,
  Role,
} from '@app/shared';

@Injectable()
export class ApiGatewayService implements OnModuleInit {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientKafka,
    @Inject(EVENTS_SERVICE) private readonly eventsClient: ClientKafka,
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.authClient.subscribeToResponseOf(AuthPatterns.REGISTER);
    this.authClient.subscribeToResponseOf(AuthPatterns.LOGIN);
    this.authClient.subscribeToResponseOf(AuthPatterns.VALIDATE_TOKEN);
    this.authClient.subscribeToResponseOf(AuthPatterns.GET_PROFILE);
    this.authClient.subscribeToResponseOf(AuthPatterns.LIST_USERS);
    this.authClient.subscribeToResponseOf(AuthPatterns.DELETE_USER);
    this.authClient.subscribeToResponseOf(AuthPatterns.UPDATE_USER_ROLE);

    this.eventsClient.subscribeToResponseOf(EventsPatterns.CREATE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.FIND_ALL);
    this.eventsClient.subscribeToResponseOf(
      EventsPatterns.FIND_FOLLOWED_BY_USER,
    );
    this.eventsClient.subscribeToResponseOf(EventsPatterns.FIND_ONE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.UPDATE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.DELETE);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.FOLLOW);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.UNFOLLOW);
    this.eventsClient.subscribeToResponseOf(EventsPatterns.ANNOUNCE);

    this.notificationsClient.subscribeToResponseOf(
      NotificationsPatterns.SEND_TO_USER,
    );
    this.notificationsClient.subscribeToResponseOf(
      NotificationsPatterns.FIND_BY_USER,
    );
    this.notificationsClient.subscribeToResponseOf(
      NotificationsPatterns.FIND_ALL,
    );
    this.notificationsClient.subscribeToResponseOf(
      'notifications.register-token',
    );

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

  getProfile(userId: string) {
    return firstValueFrom(
      this.authClient.send(AuthPatterns.GET_PROFILE, { userId }),
    );
  }

  listUsers(query: ListUsersQueryDto = {}) {
    return firstValueFrom(this.authClient.send(AuthPatterns.LIST_USERS, query));
  }

  updateUserRole(userId: string, role: Role) {
    return firstValueFrom(
      this.authClient.send(AuthPatterns.UPDATE_USER_ROLE, { userId, role }),
    );
  }

  deleteUser(userId: string) {
    return firstValueFrom(
      this.authClient.send(AuthPatterns.DELETE_USER, { userId }),
    );
  }

  createEvent(dto: CreateEventDto) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.CREATE, dto));
  }

  // Discovery browse — every event. callerUserId (if the request was
  // authenticated) gets each item annotated with isFollowing.
  findAllEvents(callerUserId?: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.FIND_ALL, { callerUserId }),
    );
  }

  // "My events" now means events the user follows, not events they created
  // (event creation is admin-only).
  findMyEvents(userId: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.FIND_FOLLOWED_BY_USER, { userId }),
    );
  }

  findEvent(eventId: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.FIND_ONE, { eventId }),
    );
  }

  updateEvent(dto: UpdateEventDto) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.UPDATE, dto));
  }

  deleteEvent(eventId: string, userId: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.DELETE, { eventId, userId }),
    );
  }

  followEvent(userId: string, eventId: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.FOLLOW, { userId, eventId }),
    );
  }

  unfollowEvent(userId: string, eventId: string) {
    return firstValueFrom(
      this.eventsClient.send(EventsPatterns.UNFOLLOW, { userId, eventId }),
    );
  }

  announceEvent(dto: AnnounceEventDto) {
    return firstValueFrom(this.eventsClient.send(EventsPatterns.ANNOUNCE, dto));
  }

  sendNotification(dto: SendToUserDto) {
    return firstValueFrom(
      this.notificationsClient.send(NotificationsPatterns.SEND_TO_USER, dto),
    );
  }

  // Fire-and-forget: emit the broadcast to Kafka and return once the broker has
  // acked the produce. The heavy 100k-device fan-out happens in the worker, so
  // the HTTP request never blocks on delivery.
  broadcast(dto: BroadcastDto, requestedBy: string) {
    const event: NotificationBroadcastEvent = {
      title: dto.title,
      body: dto.body,
      data: dto.data,
      eventId: dto.eventId,
      requestedBy,
      requestedAt: new Date(),
    };
    return firstValueFrom(
      this.notificationsClient.emit(KafkaTopics.NOTIFICATION_BROADCAST, event),
    );
  }

  registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
  ) {
    return firstValueFrom(
      this.notificationsClient.send('notifications.register-token', {
        userId,
        token,
        platform,
      }),
    );
  }

  listMyNotifications(userId: string) {
    return firstValueFrom(
      this.notificationsClient.send(NotificationsPatterns.FIND_BY_USER, {
        userId,
      }),
    );
  }

  listAllNotifications() {
    return firstValueFrom(
      this.notificationsClient.send(NotificationsPatterns.FIND_ALL, {}),
    );
  }
}
