export const EventsPatterns = {
  CREATE: 'events.create',
  FIND_ALL: 'events.find-all',
  FIND_ONE: 'events.find-one',
  UPDATE: 'events.update',
  DELETE: 'events.delete',
} as const;

export const NotificationsPatterns = {
  SEND: 'notifications.send',
} as const;

export interface EventDto {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}
