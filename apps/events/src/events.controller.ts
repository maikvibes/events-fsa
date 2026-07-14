import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EventsService } from './events.service';
import type {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  FindEventDto,
  FindEventsByUserDto,
  FollowEventDto,
  AnnounceEventDto,
  EventDto,
  CreateEventRequest,
  FindAllRequest,
  FindEventRequest,
  FindEventsByUserRequest,
  UpdateEventRequest,
  DeleteEventRequest,
  FollowEventRequest,
  AnnounceEventRequest,
  EventDtoWire,
  EventListWire,
  AnnounceResponseWire,
} from '@app/shared';
import { Empty } from '@app/shared';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @GrpcMethod('EventsService', 'Create')
  async create(data: CreateEventRequest): Promise<EventDtoWire> {
    const dto: CreateEventDto = {
      userId: data.userId,
      title: data.title,
      description: data.description,
      date: new Date(data.date),
    };
    return this.toWire(await this.eventsService.create(dto));
  }

  @GrpcMethod('EventsService', 'FindAll')
  async findAll(data: FindAllRequest): Promise<EventListWire> {
    const events = await this.eventsService.findAll(data.callerUserId);
    return { events: events.map((e) => this.toWire(e)) };
  }

  @GrpcMethod('EventsService', 'FindFollowedByUser')
  async findFollowedByUser(
    data: FindEventsByUserRequest,
  ): Promise<EventListWire> {
    const dto: FindEventsByUserDto = { userId: data.userId };
    const events = await this.eventsService.findFollowedByUser(dto);
    return { events: events.map((e) => this.toWire(e)) };
  }

  @GrpcMethod('EventsService', 'FindOne')
  async findOne(data: FindEventRequest): Promise<EventDtoWire> {
    const dto: FindEventDto = { eventId: data.eventId };
    return this.toWire(await this.eventsService.findOne(dto));
  }

  @GrpcMethod('EventsService', 'Update')
  async update(data: UpdateEventRequest): Promise<EventDtoWire> {
    const dto: UpdateEventDto = {
      eventId: data.eventId,
      userId: data.userId,
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
    };
    return this.toWire(await this.eventsService.update(dto));
  }

  @GrpcMethod('EventsService', 'Delete')
  async delete(data: DeleteEventRequest): Promise<Empty> {
    const dto: DeleteEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.delete(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Follow')
  async follow(data: FollowEventRequest): Promise<Empty> {
    const dto: FollowEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.follow(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Unfollow')
  async unfollow(data: FollowEventRequest): Promise<Empty> {
    const dto: FollowEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.unfollow(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Announce')
  announce(data: AnnounceEventRequest): Promise<AnnounceResponseWire> {
    const dto: AnnounceEventDto = {
      eventId: data.eventId,
      title: data.title,
      body: data.body,
    };
    return this.eventsService.announce(dto);
  }

  private toWire(e: EventDto): EventDtoWire {
    return {
      eventId: e.eventId,
      userId: e.userId,
      title: e.title,
      description: e.description,
      // Coerce with new Date(): fresh DB reads give Date objects, but Redis
      // cache hits come back from JSON.parse with these fields as ISO strings.
      date: new Date(e.date).toISOString(),
      createdAt: new Date(e.createdAt).toISOString(),
      updatedAt: new Date(e.updatedAt).toISOString(),
      ...(e.isFollowing !== undefined && { isFollowing: e.isFollowing }),
    };
  }
}
