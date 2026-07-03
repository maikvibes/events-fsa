import { z } from 'zod';

const eventIdMeta = {
  description: 'UUID of the event.',
  example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
};
const userIdMeta = {
  description: 'UUID of the owning user (derived from the bearer token).',
  example: '11111111-2222-3333-4444-555555555555',
};
const titleMeta = {
  description: 'Event title, 1–200 characters.',
  example: 'FSA Tech Meetup',
};
const descriptionMeta = {
  description: 'Event description, 1–2000 characters.',
  example: 'An evening of talks on Node.js microservices and Kafka.',
};

export const CreateEventSchema = z.object({
  userId: z.uuid().meta(userIdMeta),
  title: z.string().min(1).max(200).trim().meta(titleMeta),
  description: z.string().min(1).max(2000).trim().meta(descriptionMeta),
  date: z.coerce
    .date()
    .refine((d) => d > new Date(), {
      message: 'Event date must be in the future',
    })
    .meta({
      description:
        'Event start time as an ISO 8601 datetime. Must be in the future.',
      example: '2026-09-01T18:30:00.000Z',
    }),
});

export const UpdateEventSchema = z.object({
  eventId: z.uuid().meta(eventIdMeta),
  userId: z.uuid().meta(userIdMeta),
  title: z.string().min(1).max(200).trim().optional().meta(titleMeta),
  description: z
    .string()
    .min(1)
    .max(2000)
    .trim()
    .optional()
    .meta(descriptionMeta),
  date: z.coerce.date().optional().meta({
    description: 'New event start time as an ISO 8601 datetime.',
    example: '2026-09-01T18:30:00.000Z',
  }),
});

export const DeleteEventSchema = z.object({
  eventId: z.uuid(),
  userId: z.uuid(),
});

export const FindEventSchema = z.object({
  eventId: z.uuid(),
});

export const FindEventsByUserSchema = z.object({
  userId: z.uuid(),
});

export type CreateEventDto = z.infer<typeof CreateEventSchema>;
export type UpdateEventDto = z.infer<typeof UpdateEventSchema>;
export type DeleteEventDto = z.infer<typeof DeleteEventSchema>;
export type FindEventDto = z.infer<typeof FindEventSchema>;
export type FindEventsByUserDto = z.infer<typeof FindEventsByUserSchema>;
