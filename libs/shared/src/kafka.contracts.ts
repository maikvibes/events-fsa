export enum KafkaTopics {
  AUTH_USER_CREATED = 'auth.user.created',
  AUTH_USER_UPDATED = 'auth.user.updated',
  AUTH_USER_DELETED = 'auth.user.deleted',
  EVENT_CREATED = 'event.created',
  EVENT_UPDATED = 'event.updated',
  EVENT_DELETED = 'event.deleted',
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_FAILED = 'notification.failed',
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
