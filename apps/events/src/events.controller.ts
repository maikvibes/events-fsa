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
} from '@app/shared';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @MessagePattern(EventsPatterns.CREATE)
  create(@Payload() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @MessagePattern(EventsPatterns.FIND_ALL)
  findAll(@Payload() dto: FindEventsByUserDto) {
    return this.eventsService.findAll(dto);
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
}
