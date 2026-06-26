import { z } from 'zod';

export const CreateEventSchema = z.object({
  userId: z.uuid(),
  title: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(2000).trim(),
  date: z.coerce.date().refine((d) => d > new Date(), { message: 'Event date must be in the future' }),
});

export const UpdateEventSchema = z.object({
  eventId: z.uuid(),
  userId: z.uuid(),
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(2000).trim().optional(),
  date: z.coerce.date().optional(),
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
