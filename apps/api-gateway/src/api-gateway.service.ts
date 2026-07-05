import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc, ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  NotificationsPatterns,
  KafkaTopics,
  AuthServiceClient,
  EventsServiceClient,
  PaginatedUsers,
  UserSummary,
  UserSummaryWire,
  Role,
  EventDto,
  EventDtoWire,
  RegisterDto,
  LoginDto,
  ListUsersQueryDto,
  CreateEventDto,
  UpdateEventDto,
  AnnounceEventDto,
  SendToUserDto,
  BroadcastDto,
  NotificationBroadcastEvent,
} from '@app/shared';

@Injectable()
export class ApiGatewayService implements OnModuleInit {
  private authGrpc!: AuthServiceClient;
  private eventsGrpc!: EventsServiceClient;

  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientGrpc,
    @Inject(EVENTS_SERVICE) private readonly eventsClient: ClientGrpc,
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.authGrpc =
      this.authClient.getService<AuthServiceClient>('AuthService');
    this.eventsGrpc =
      this.eventsClient.getService<EventsServiceClient>('EventsService');

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

    await this.notificationsClient.connect();
  }

  register(dto: RegisterDto) {
    return firstValueFrom(this.authGrpc.register(dto));
  }

  login(dto: LoginDto) {
    return firstValueFrom(this.authGrpc.login(dto));
  }

  getProfile(userId: string) {
    return firstValueFrom(this.authGrpc.getProfile({ userId }));
  }

  async listUsers(query: ListUsersQueryDto = {}): Promise<PaginatedUsers> {
    const result = await firstValueFrom(this.authGrpc.listUsers(query));
    return {
      items: result.items.map((u) => this.toUserSummary(u)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async updateUserRole(userId: string, role: Role): Promise<UserSummary> {
    const user = await firstValueFrom(
      this.authGrpc.updateUserRole({ userId, role }),
    );
    return this.toUserSummary(user);
  }

  async deleteUser(userId: string): Promise<void> {
    await firstValueFrom(this.authGrpc.deleteUser({ userId }));
  }

  async createEvent(dto: CreateEventDto): Promise<EventDto> {
    const wire = await firstValueFrom(
      this.eventsGrpc.create({ ...dto, date: dto.date.toISOString() }),
    );
    return this.toEventDto(wire);
  }

  // Discovery browse — every event. callerUserId (if the request was
  // authenticated) gets each item annotated with isFollowing.
  async findAllEvents(callerUserId?: string): Promise<EventDto[]> {
    const { events } = await firstValueFrom(
      this.eventsGrpc.findAll({ callerUserId }),
    );
    return events.map((e) => this.toEventDto(e));
  }

  // "My events" now means events the user follows, not events they created
  // (event creation is admin-only).
  async findMyEvents(userId: string): Promise<EventDto[]> {
    const { events } = await firstValueFrom(
      this.eventsGrpc.findFollowedByUser({ userId }),
    );
    return events.map((e) => this.toEventDto(e));
  }

  async findEvent(eventId: string): Promise<EventDto> {
    const wire = await firstValueFrom(this.eventsGrpc.findOne({ eventId }));
    return this.toEventDto(wire);
  }

  async updateEvent(dto: UpdateEventDto): Promise<EventDto> {
    const wire = await firstValueFrom(
      this.eventsGrpc.update({ ...dto, date: dto.date?.toISOString() }),
    );
    return this.toEventDto(wire);
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.delete({ eventId, userId }));
  }

  async followEvent(userId: string, eventId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.follow({ eventId, userId }));
  }

  async unfollowEvent(userId: string, eventId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.unfollow({ eventId, userId }));
  }

  announceEvent(dto: AnnounceEventDto) {
    return firstValueFrom(this.eventsGrpc.announce(dto));
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

  private toUserSummary(u: UserSummaryWire): UserSummary {
    return {
      userId: u.userId,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: new Date(u.createdAt),
    };
  }

  private toEventDto(w: EventDtoWire): EventDto {
    return {
      eventId: w.eventId,
      userId: w.userId,
      title: w.title,
      description: w.description,
      date: new Date(w.date),
      createdAt: new Date(w.createdAt),
      updatedAt: new Date(w.updatedAt),
      ...(w.isFollowing !== undefined && { isFollowing: w.isFollowing }),
    };
  }
}
