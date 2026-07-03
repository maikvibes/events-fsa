import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { EventsPatterns } from '@app/shared';
import type {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  FindEventDto,
  FindEventsByUserDto,
  FollowEventDto,
  AnnounceEventDto,
} from '@app/shared';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @MessagePattern(EventsPatterns.CREATE)
  create(@Payload() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @MessagePattern(EventsPatterns.FIND_ALL)
  findAll(@Payload() dto: { callerUserId?: string }) {
    return this.eventsService.findAll(dto.callerUserId);
  }

  @MessagePattern(EventsPatterns.FIND_FOLLOWED_BY_USER)
  findFollowedByUser(@Payload() dto: FindEventsByUserDto) {
    return this.eventsService.findFollowedByUser(dto);
  }

  @MessagePattern(EventsPatterns.FIND_ONE)
  findOne(@Payload() dto: FindEventDto) {
    return this.eventsService.findOne(dto);
  }

  @MessagePattern(EventsPatterns.UPDATE)
  update(@Payload() dto: UpdateEventDto) {
    return this.eventsService.update(dto);
  }

  @MessagePattern(EventsPatterns.DELETE)
  delete(@Payload() dto: DeleteEventDto) {
    return this.eventsService.delete(dto);
  }

  @MessagePattern(EventsPatterns.FOLLOW)
  follow(@Payload() dto: FollowEventDto) {
    return this.eventsService.follow(dto);
  }

  @MessagePattern(EventsPatterns.UNFOLLOW)
  unfollow(@Payload() dto: FollowEventDto) {
    return this.eventsService.unfollow(dto);
  }

  @MessagePattern(EventsPatterns.ANNOUNCE)
  announce(@Payload() dto: AnnounceEventDto) {
    return this.eventsService.announce(dto);
  }
}
