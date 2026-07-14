// Shared shapes for the admin "seed the database" jobs. A job seeds users
// (auth-svc, over gRPC) and device tokens (notifications-svc, over Kafka) in
// parallel; both report progress into one Redis hash the gateway reads.

export type SeedPartName = 'users' | 'tokens';

export type SeedPartStatus = 'running' | 'done' | 'error';

export interface SeedPartProgress {
  done: number;
  total: number;
  status: SeedPartStatus;
}

export interface SeedJobProgress {
  jobId: string;
  users: SeedPartProgress;
  tokens: SeedPartProgress;
  startedAt: string | null;
  // True once both parts have reached a terminal state (done or error).
  finished: boolean;
}

export const SeedKeys = {
  JOB: (jobId: string) => `seed:job:${jobId}`,
} as const;

// A job can't realistically still be seeding after an hour.
export const SEED_JOB_TTL = 3600;
