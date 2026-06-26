import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  FindEventDto,
  FindEventsByUserDto,
  EventDto,
  EventCreatedEvent,
  EventUpdatedEvent,
  EventDeletedEvent,
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

    await this.cache.del(CacheKeys.EVENTS_BY_USER(dto.userId));

    return this.toDto(event);
  }

  async findAll(dto: FindEventsByUserDto): Promise<EventDto[]> {
    const cacheKey = CacheKeys.EVENTS_BY_USER(dto.userId);
    const cached = await this.cache.get<EventDto[]>(cacheKey);
    if (cached) return cached;

    const events = await this.prisma.event.findMany({
      where: { userId: dto.userId },
      orderBy: { date: 'asc' },
    });
    const result = events.map((e) => this.toDto(e));
    await this.cache.set(cacheKey, result, CacheTTL.EVENTS_LIST);
    return result;
  }

  async findOne(dto: FindEventDto): Promise<EventDto> {
    const cacheKey = CacheKeys.EVENT(dto.eventId);
    const cached = await this.cache.get<EventDto>(cacheKey);
    if (cached) return cached;

    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new RpcException({ statusCode: 404, message: 'Event not found' });

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

    await this.cache.del(CacheKeys.EVENT(event.id), CacheKeys.EVENTS_BY_USER(event.userId));

    return this.toDto(event);
  }

  async delete(dto: DeleteEventDto): Promise<void> {
    this.logger.log(`Deleting event ${dto.eventId}`);
    const event = await this.prisma.event.delete({ where: { id: dto.eventId } });

    const payload: EventDeletedEvent = {
      eventId: event.id,
      userId: event.userId,
      deletedAt: new Date(),
    };
    this.producer.emit(KafkaTopics.EVENT_DELETED, payload);

    await this.cache.del(CacheKeys.EVENT(event.id), CacheKeys.EVENTS_BY_USER(event.userId));
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
