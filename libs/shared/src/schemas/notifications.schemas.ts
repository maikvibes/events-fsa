import { z } from 'zod';

export const SendNotificationSchema = z.object({
  userId: z.uuid(),
  deviceToken: z.string().min(1),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
  eventId: z.uuid().optional(),
});

const notifTitleMeta = {
  description: 'Notification title, 1–100 characters.',
  example: 'Your event starts soon',
};
const notifBodyMeta = {
  description: 'Notification body text, 1–500 characters.',
  example: 'FSA Tech Meetup begins in 30 minutes.',
};
const notifDataMeta = {
  description:
    'Optional key/value payload delivered with the push (string values only).',
  example: { eventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'reminder' },
};
const notifEventIdMeta = {
  description: 'Optional UUID of the related event.',
  example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
};

export const SendToUserSchema = z.object({
  userId: z.uuid().meta({
    description: "UUID of the recipient user whose devices receive the push.",
    example: '11111111-2222-3333-4444-555555555555',
  }),
  title: z.string().min(1).max(100).meta(notifTitleMeta),
  body: z.string().min(1).max(500).meta(notifBodyMeta),
  data: z.record(z.string(), z.string()).optional().meta(notifDataMeta),
  eventId: z.uuid().optional().meta(notifEventIdMeta),
});

export const SendMulticastSchema = z.object({
  tokens: z.array(z.string().min(1)).min(1).max(10000),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

export const RegisterDeviceTokenSchema = z.object({
  userId: z.uuid().meta({
    description: 'UUID of the token owner (derived from the bearer token).',
    example: '11111111-2222-3333-4444-555555555555',
  }),
  token: z.string().min(1).meta({
    description: 'FCM/APNs device registration token.',
    example: 'fMEP0v...:APA91bH...',
  }),
  platform: z.enum(['ios', 'android', 'web']).meta({
    description: 'Device platform the token belongs to.',
    example: 'android',
  }),
});

export const BroadcastSchema = z.object({
  title: z.string().min(1).max(100).meta(notifTitleMeta),
  body: z.string().min(1).max(500).meta(notifBodyMeta),
  data: z.record(z.string(), z.string()).optional().meta(notifDataMeta),
});

export type SendNotificationDto = z.infer<typeof SendNotificationSchema>;
export type SendToUserDto = z.infer<typeof SendToUserSchema>;
export type SendMulticastDto = z.infer<typeof SendMulticastSchema>;
export type RegisterDeviceTokenDto = z.infer<typeof RegisterDeviceTokenSchema>;
export type BroadcastDto = z.infer<typeof BroadcastSchema>;
