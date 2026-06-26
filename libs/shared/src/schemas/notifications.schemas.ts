import { z } from 'zod';

export const SendNotificationSchema = z.object({
  userId: z.uuid(),
  deviceToken: z.string().min(1),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
  eventId: z.uuid().optional(),
});

export const RegisterDeviceTokenSchema = z.object({
  userId: z.uuid(),
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});

export type SendNotificationDto = z.infer<typeof SendNotificationSchema>;
export type RegisterDeviceTokenDto = z.infer<typeof RegisterDeviceTokenSchema>;
