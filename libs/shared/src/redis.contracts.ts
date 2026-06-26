export const CacheKeys = {
  USER: (userId: string) => `user:${userId}`,
  USER_DEVICE_TOKENS: (userId: string) => `user:${userId}:device-tokens`,
  EVENT: (eventId: string) => `event:${eventId}`,
  EVENTS_BY_USER: (userId: string) => `events:user:${userId}`,
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
