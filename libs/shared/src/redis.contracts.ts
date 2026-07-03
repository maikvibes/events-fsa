export const CacheKeys = {
  USER: (userId: string) => `user:${userId}`,
  USER_DEVICE_TOKENS: (userId: string) => `user:${userId}:device-tokens`,
  EVENT: (eventId: string) => `event:${eventId}`,
  // Events a user follows — key name predates the follow feature (used to
  // mean "events owned by user"), kept as-is since it's just a cache key string.
  EVENTS_BY_USER: (userId: string) => `events:user:${userId}`,
  EVENTS_ALL: 'events:all',
} as const;

export const CacheTTL = {
  USER: 3600,
  EVENT: 1800,
  EVENTS_LIST: 300,
  DEVICE_TOKENS: 86400,
} as const;

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  ttl?: number;
}
