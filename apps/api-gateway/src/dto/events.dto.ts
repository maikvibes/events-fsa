import { createZodDto } from 'nestjs-zod';
import { CreateEventSchema, UpdateEventSchema } from '@app/shared';
import { z } from 'zod';

// z.coerce.date() can't be serialized to JSON Schema in Zod v4.
// These DTOs are OpenAPI-only; runtime validation uses ZodValidationPipe with the original schemas.
export class CreateEventBodyDto extends createZodDto(
  CreateEventSchema.omit({ userId: true }).extend({
    date: z.string().describe('ISO 8601 datetime string — must be in the future'),
  }),
) {}

export class UpdateEventBodyDto extends createZodDto(
  UpdateEventSchema.omit({ userId: true, eventId: true }).extend({
    date: z.string().optional().describe('ISO 8601 datetime string'),
  }),
) {}
