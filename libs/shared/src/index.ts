export * from './shared.module';
export * from './shared.service';
export * from './kafka.contracts';
export * from './kafka-config';
export * from './grpc-config';
export * from './firebase.contracts';
export * from './redis.contracts';
export * from './schemas';

// Re-export auth contracts (non-DTO — response shapes and token payload)
export * from './auth.contracts';
// Re-export events-svc contracts (patterns, EventDto response shape)
export * from './events-svc.contracts';
// Re-export analytics contracts (broadcast run patterns + response shapes)
export * from './analytics.contracts';
// Re-export seed job contracts + the shared Redis progress service
export * from './seed.contracts';
export * from './seed-progress.service';
