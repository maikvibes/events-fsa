export const EventsPatterns = {
  CREATE: 'events.create',
  // All events (discovery browse) — `FIND_ALL` used to mean "events owned by
  // one user"; that's now FIND_FOLLOWED_BY_USER since ownership no longer
  // gates visibility (event mutation is admin-only, follow is per-user).
  FIND_ALL: 'events.find-all',
  FIND_FOLLOWED_BY_USER: 'events.find-followed-by-user',
  FIND_ONE: 'events.find-one',
  UPDATE: 'events.update',
  DELETE: 'events.delete',
  FOLLOW: 'events.follow',
  UNFOLLOW: 'events.unfollow',
  ANNOUNCE: 'events.announce',
} as const;

export const NotificationsPatterns = {
  SEND: 'notifications.send',
  SEND_TO_USER: 'notifications.send-to-user',
  MULTICAST: 'notifications.multicast',
  BROADCAST: 'notifications.broadcast',
  FIND_BY_USER: 'notifications.find-by-user',
  FIND_ALL: 'notifications.find-all',
} as const;

export interface EventDto {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  // Only populated when the query was made on behalf of an authenticated
  // caller (browse/follow list) — omitted for admin-facing raw reads.
  isFollowing?: boolean;
}
