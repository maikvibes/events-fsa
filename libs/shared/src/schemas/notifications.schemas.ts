import { z } from 'zod';

export const SendNotificationSchema = z.object({
  userId: z.uuid(),
  deviceToken: z.string().min(1),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
  eventId: z.uuid().optional(),
});

// HTTP-facing: send to a specific recipient (userId in body). The server resolves
// that user's device tokens and multicasts — the caller never handles raw FCM tokens.
export const SendToUserSchema = z.object({
  userId: z.uuid(),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
  eventId: z.uuid().optional(),
});

export const SendMulticastSchema = z.object({
  tokens: z.array(z.string().min(1)).min(1).max(10000),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

export const RegisterDeviceTokenSchema = z.object({
  userId: z.uuid(),
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});

export const BroadcastSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
  eventId: z.uuid().optional(),
});

// Admin notification-log listing: pagination + filtering. `search` matches the
// title/body; `status` filters sent/failed; `userId`/`eventId` narrow to a
// recipient/event; `createdFrom`/`createdTo` bound the date range (inclusive).
export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['sent', 'failed']).optional(),
  userId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export interface NotificationLogItem {
  id: string;
  userId: string;
  eventId: string | null;
  title: string;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface PaginatedNotifications {
  items: NotificationLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type SendNotificationDto = z.infer<typeof SendNotificationSchema>;
export type SendToUserDto = z.infer<typeof SendToUserSchema>;
export type SendMulticastDto = z.infer<typeof SendMulticastSchema>;
export type RegisterDeviceTokenDto = z.infer<typeof RegisterDeviceTokenSchema>;
export type BroadcastDto = z.infer<typeof BroadcastSchema>;
export type ListNotificationsQueryDto = z.infer<
  typeof ListNotificationsQuerySchema
>;
