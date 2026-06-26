import { createZodDto } from 'nestjs-zod';
import { CreateEventSchema, UpdateEventSchema } from '@app/shared';

export class CreateEventBodyDto extends createZodDto(CreateEventSchema.omit({ userId: true })) {}
export class UpdateEventBodyDto extends createZodDto(UpdateEventSchema.omit({ userId: true, eventId: true })) {}
