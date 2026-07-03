import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  FindEventDto,
  FindEventsByUserDto,
  FollowEventDto,
  AnnounceEventDto,
  EventDto,
  EventCreatedEvent,
  EventUpdatedEvent,
  EventDeletedEvent,
  EventFollowerNotifyEvent,
  KafkaTopics,
  CacheKeys,
  CacheTTL,
  EVENTS_KAFKA_PRODUCER,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import { RedisCacheService } from './redis-cache.service';

type PrismaEvent = {
  id: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    @Inject(EVENTS_KAFKA_PRODUCER) private readonly producer: ClientProxy,
  ) {}

  async create(dto: CreateEventDto): Promise<EventDto> {
    this.logger.log(`Creating event for user ${dto.userId}`);
    const event = await this.prisma.event.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        description: dto.description,
        date: new Date(dto.date),
      },
    });

    const payload: EventCreatedEvent = {
      eventId: event.id,
      userId: event.userId,
      title: event.title,
      description: event.description,
      date: event.date,
      createdAt: event.createdAt,
    };
    this.producer.emit(KafkaTopics.EVENT_CREATED, payload);

    await this.cache.del(CacheKeys.EVENTS_ALL);

    return this.toDto(event);
  }

  // Discovery browse: every event, regardless of who created it. isFollowing
  // is computed after the cache read (never cached itself) since it's specific
  // to whichever caller is asking, not to the event list.
  async findAll(callerUserId?: string): Promise<EventDto[]> {
    const cached = await this.cache.get<EventDto[]>(CacheKeys.EVENTS_ALL);
    const events =
      cached ??
      (await this.prisma.event.findMany({ orderBy: { date: 'asc' } })).map(
        (e) => this.toDto(e),
      );
    if (!cached)
      await this.cache.set(CacheKeys.EVENTS_ALL, events, CacheTTL.EVENTS_LIST);

    if (!callerUserId) return events;

    const followed = await this.prisma.eventFollow.findMany({
      where: {
        userId: callerUserId,
        eventId: { in: events.map((e) => e.eventId) },
      },
      select: { eventId: true },
    });
    const followedIds = new Set(followed.map((f) => f.eventId));
    return events.map((e) => ({
      ...e,
      isFollowing: followedIds.has(e.eventId),
    }));
  }

  // Events a user follows (mobile's "My events" — replaces the old
  // owner-based /events/me now that creation is admin-only).
  async findFollowedByUser(dto: FindEventsByUserDto): Promise<EventDto[]> {
    const cacheKey = CacheKeys.EVENTS_BY_USER(dto.userId);
    const cached = await this.cache.get<EventDto[]>(cacheKey);
    if (cached) return cached;

    const events = await this.prisma.event.findMany({
      where: { follows: { some: { userId: dto.userId } } },
      orderBy: { date: 'asc' },
    });
    const result = events.map((e) => ({ ...this.toDto(e), isFollowing: true }));
    await this.cache.set(cacheKey, result, CacheTTL.EVENTS_LIST);
    return result;
  }

  async follow(dto: FollowEventDto): Promise<void> {
    await this.prisma.eventFollow.upsert({
      where: { userId_eventId: { userId: dto.userId, eventId: dto.eventId } },
      create: { userId: dto.userId, eventId: dto.eventId },
      update: {},
    });
    await this.cache.del(CacheKeys.EVENTS_BY_USER(dto.userId));
  }

  async unfollow(dto: FollowEventDto): Promise<void> {
    await this.prisma.eventFollow.deleteMany({
      where: { userId: dto.userId, eventId: dto.eventId },
    });
    await this.cache.del(CacheKeys.EVENTS_BY_USER(dto.userId));
  }

  // Manual owner/admin-authored push to everyone following this event.
  async announce(dto: AnnounceEventDto): Promise<{ notified: number }> {
    const followerUserIds = await this.resolveFollowerIds(dto.eventId);
    if (followerUserIds.length) {
      const payload: EventFollowerNotifyEvent = {
        eventId: dto.eventId,
        title: dto.title,
        body: dto.body,
        followerUserIds,
      };
      this.producer.emit(KafkaTopics.EVENT_ANNOUNCEMENT, payload);
    }
    return { notified: followerUserIds.length };
  }

  private async resolveFollowerIds(eventId: string): Promise<string[]> {
    const follows = await this.prisma.eventFollow.findMany({
      where: { eventId },
      select: { userId: true },
    });
    return follows.map((f) => f.userId);
  }

  async findOne(dto: FindEventDto): Promise<EventDto> {
    const cacheKey = CacheKeys.EVENT(dto.eventId);
    const cached = await this.cache.get<EventDto>(cacheKey);
    if (cached) return cached;

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });
    if (!event)
      throw new RpcException({ statusCode: 404, message: 'Event not found' });

    const result = this.toDto(event);
    await this.cache.set(cacheKey, result, CacheTTL.EVENT);
    return result;
  }

  async update(dto: UpdateEventDto): Promise<EventDto> {
    this.logger.log(`Updating event ${dto.eventId}`);
    const event = await this.prisma.event.update({
      where: { id: dto.eventId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.date && { date: new Date(dto.date) }),
      },
    });

    const payload: EventUpdatedEvent = {
      eventId: event.id,
      userId: event.userId,
      title: event.title,
      description: event.description,
      date: event.date,
      updatedAt: event.updatedAt,
    };
    this.producer.emit(KafkaTopics.EVENT_UPDATED, payload);

    const followerUserIds = await this.resolveFollowerIds(event.id);
    if (followerUserIds.length) {
      const followerPayload: EventFollowerNotifyEvent = {
        eventId: event.id,
        title: `Event updated: ${event.title}`,
        body: event.description,
        followerUserIds,
      };
      this.producer.emit(
        KafkaTopics.EVENT_UPDATED_FOR_FOLLOWERS,
        followerPayload,
      );
    }

    await this.cache.del(CacheKeys.EVENT(event.id), CacheKeys.EVENTS_ALL);

    return this.toDto(event);
  }

  async delete(dto: DeleteEventDto): Promise<void> {
    this.logger.log(`Deleting event ${dto.eventId}`);
    // Followers must be resolved before the delete — EventFollow rows cascade
    // away with the Event, so they're unrecoverable afterward.
    const followerUserIds = await this.resolveFollowerIds(dto.eventId);

    const event = await this.prisma.event.delete({
      where: { id: dto.eventId },
    });

    const payload: EventDeletedEvent = {
      eventId: event.id,
      userId: event.userId,
      deletedAt: new Date(),
    };
    this.producer.emit(KafkaTopics.EVENT_DELETED, payload);

    if (followerUserIds.length) {
      const followerPayload: EventFollowerNotifyEvent = {
        eventId: event.id,
        title: `Event cancelled: ${event.title}`,
        body: 'This event has been cancelled by its organizer.',
        followerUserIds,
      };
      this.producer.emit(
        KafkaTopics.EVENT_DELETED_FOR_FOLLOWERS,
        followerPayload,
      );
    }

    await this.cache.del(CacheKeys.EVENT(event.id), CacheKeys.EVENTS_ALL);
  }

  private toDto(event: PrismaEvent): EventDto {
    return {
      eventId: event.id,
      userId: event.userId,
      title: event.title,
      description: event.description,
      date: event.date,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
