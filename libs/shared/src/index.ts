export * from './shared.module';
export * from './shared.service';
export * from './kafka.contracts';
export * from './kafka-config';
export * from './firebase.contracts';
export * from './redis.contracts';
export * from './schemas';

// Re-export auth contracts (non-DTO — response shapes and token payload)
export * from './auth.contracts';
// Re-export events-svc contracts (patterns, EventDto response shape)
export * from './events-svc.contracts';
