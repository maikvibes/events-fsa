// Analytics service contracts — request/reply patterns the gateway calls over
// Kafka, plus the response shapes returned to the web app.

export const AnalyticsPatterns = {
  LIST_BROADCAST_RUNS: 'analytics.broadcast.list-runs',
  GET_BROADCAST_RUN: 'analytics.broadcast.get-run',
  GET_LATEST_BROADCAST_RUN: 'analytics.broadcast.get-latest-run',
} as const;

export type BroadcastRunStatus =
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface BroadcastInstanceStatDto {
  instance: string;
  batches: number;
  sent: number;
  failed: number;
}

// One row in the run-history list.
export interface BroadcastRunSummary {
  broadcastId: string;
  title: string;
  body: string;
  requestedBy: string;
  status: BroadcastRunStatus;
  totalBatches: number | null;
  totalTokens: number | null;
  receivedBatches: number;
  sent: number;
  failed: number;
  instanceCount: number;
  requestedAt: string;
  firstCompletionAt: string | null;
  lastCompletionAt: string | null;
  completedAt: string | null;
}

// A run plus its per-instance breakdown (detail view / live dashboard).
export interface BroadcastRunDetail extends BroadcastRunSummary {
  instances: BroadcastInstanceStatDto[];
}
