import { randomUUID } from 'crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc, ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  ANALYTICS_SERVICE,
  NotificationsPatterns,
  AnalyticsPatterns,
  BroadcastRunSummary,
  BroadcastRunDetail,
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
  NotificationBroadcastCancelledEvent,
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
    @Inject(ANALYTICS_SERVICE)
    private readonly analyticsClient: ClientKafka,
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

    this.analyticsClient.subscribeToResponseOf(
      AnalyticsPatterns.LIST_BROADCAST_RUNS,
    );
    this.analyticsClient.subscribeToResponseOf(
      AnalyticsPatterns.GET_BROADCAST_RUN,
    );
    this.analyticsClient.subscribeToResponseOf(
      AnalyticsPatterns.GET_LATEST_BROADCAST_RUN,
    );

    await this.notificationsClient.connect();
    await this.analyticsClient.connect();
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
  async broadcast(dto: BroadcastDto, requestedBy: string): Promise<string> {
    const broadcastId = randomUUID();
    const event: NotificationBroadcastEvent = {
      broadcastId,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      eventId: dto.eventId,
      requestedBy,
      requestedAt: new Date(),
    };
    await firstValueFrom(
      this.notificationsClient.emit(KafkaTopics.NOTIFICATION_BROADCAST, event),
    );
    return broadcastId;
  }

  // Cooperative cancel: emit the cancelled event. notifications-svc sets the
  // Redis flag (dispatcher + workers stop sending) and analytics-svc marks the
  // run cancelled. Fire-and-forget — the run status reflects the outcome.
  async cancelBroadcast(broadcastId: string, cancelledBy: string): Promise<void> {
    const event: NotificationBroadcastCancelledEvent = {
      broadcastId,
      cancelledBy,
      cancelledAt: new Date(),
    };
    await firstValueFrom(
      this.notificationsClient.emit(
        KafkaTopics.NOTIFICATION_BROADCAST_CANCELLED,
        event,
      ),
    );
  }

  // Broadcast run history — proxied to analytics-svc, which owns the DB.
  listBroadcastRuns(limit?: number): Promise<BroadcastRunSummary[]> {
    return firstValueFrom(
      this.analyticsClient.send(AnalyticsPatterns.LIST_BROADCAST_RUNS, {
        limit,
      }),
    );
  }

  getBroadcastRun(broadcastId: string): Promise<BroadcastRunDetail | null> {
    return firstValueFrom(
      this.analyticsClient.send(AnalyticsPatterns.GET_BROADCAST_RUN, {
        broadcastId,
      }),
    );
  }

  getLatestBroadcastRun(): Promise<BroadcastRunDetail | null> {
    return firstValueFrom(
      this.analyticsClient.send(AnalyticsPatterns.GET_LATEST_BROADCAST_RUN, {}),
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
