import { createZodDto } from 'nestjs-zod';
import { CreateEventSchema, UpdateEventSchema } from '@app/shared';
import { z } from 'zod';

// z.coerce.date() can't be serialized to JSON Schema in Zod v4.
// These DTOs are OpenAPI-only; runtime validation uses ZodValidationPipe with the original schemas.
export class CreateEventBodyDto extends createZodDto(
  CreateEventSchema.omit({ userId: true }).extend({
    date: z.string().meta({
      description: 'Event start time as an ISO 8601 datetime. Must be in the future.',
      example: '2026-09-01T18:30:00.000Z',
    }),
  }),
) {}

export class UpdateEventBodyDto extends createZodDto(
  UpdateEventSchema.omit({ userId: true, eventId: true }).extend({
    date: z.string().optional().meta({
      description: 'New event start time as an ISO 8601 datetime.',
      example: '2026-09-01T18:30:00.000Z',
    }),
  }),
) {}
