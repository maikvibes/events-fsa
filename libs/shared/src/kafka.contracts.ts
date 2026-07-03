export enum KafkaTopics {
  AUTH_USER_CREATED = 'auth.user.created',
  AUTH_USER_UPDATED = 'auth.user.updated',
  AUTH_USER_DELETED = 'auth.user.deleted',
  EVENT_CREATED = 'event.created',
  EVENT_UPDATED = 'event.updated',
  EVENT_DELETED = 'event.deleted',
  // Follower-fanout topics: emitted alongside the raw EVENT_UPDATED/DELETED
  // above, carrying the pre-resolved follower list so notifications-svc never
  // has to query events-svc's database directly.
  EVENT_UPDATED_FOR_FOLLOWERS = 'event.updated.for-followers',
  EVENT_DELETED_FOR_FOLLOWERS = 'event.deleted.for-followers',
  EVENT_ANNOUNCEMENT = 'event.announcement',
  EVENT_REMINDER_DUE = 'event.reminder-due',
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_FAILED = 'notification.failed',
  NOTIFICATION_BROADCAST = 'notification.broadcast',
}

export interface UserCreatedEvent {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface UserUpdatedEvent {
  userId: string;
  email?: string;
  name?: string;
  updatedAt: Date;
}

export interface UserDeletedEvent {
  userId: string;
  deletedAt: Date;
}

export interface EventCreatedEvent {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
}

export interface EventUpdatedEvent {
  eventId: string;
  userId: string;
  title?: string;
  description?: string;
  date?: Date;
  updatedAt: Date;
}

export interface EventDeletedEvent {
  eventId: string;
  userId: string;
  deletedAt: Date;
}

// Shared shape for every follower-fanout topic (update/delete/announce/reminder)
// — events-svc resolves followerUserIds itself since notifications-svc can't
// query events-svc's database.
export interface EventFollowerNotifyEvent {
  eventId: string;
  title: string;
  body: string;
  followerUserIds: string[];
}

export interface NotificationSentEvent {
  notificationId: string;
  userId: string;
  eventId: string;
  title: string;
  body: string;
  sentAt: Date;
}

export interface NotificationFailedEvent {
  notificationId: string;
  userId: string;
  eventId: string;
  error: string;
  failedAt: Date;
}

// Fire-and-forget: an admin requests a push to ALL users. The gateway emits this
// on NOTIFICATION_BROADCAST and returns 202 immediately; the notifications worker
// consumes it and fans out to every device token in FCM multicast batches.
export interface NotificationBroadcastEvent {
  title: string;
  body: string;
  data?: Record<string, string>;
  eventId?: string;
  requestedBy: string; // admin userId, for audit
  requestedAt: Date;
}
