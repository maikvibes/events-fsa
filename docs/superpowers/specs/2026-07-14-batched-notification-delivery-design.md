# Batched Notification Delivery + 1M-User Seed — Design Spec

## Goal

Make broadcast fanout survive 1M recipients by turning the single-handler
`broadcast()` into a **dispatcher + worker-pool** over a Kafka batch topic,
run **4 worker replicas** in dev compose that share the load via a Kafka
consumer group, **stamp each batch's completion with the instance that
processed it**, and provide a **bulk seeder** that loads 1M users (auth DB) and
1M device tokens (notifications DB).

## Current state (context)

- `POST /notifications/broadcast` → gateway emits `NOTIFICATION_BROADCAST`
  Kafka event, returns 202.
- Notifications service consumes it in `broadcast()`, which:
  - `findMany` **all** device tokens into memory (unbounded),
  - fans out via `sendMulticast()` in FCM chunks of 500,
  - writes **all** logs in one `createMany`.
- At 1M recipients this exhausts memory and has no restart resilience — a crash
  mid-fanout restarts the entire broadcast.
- Users live in the auth DB (`apps/auth`), device tokens in the notifications
  DB. `scripts/seed.ts` is the idempotent 3-user dev seed (left untouched).

## Part A — Batched (queue + worker) delivery

### New Kafka contracts (`libs/shared/src/kafka.contracts.ts`)

```ts
NOTIFICATION_BROADCAST_BATCH = 'notification.broadcast-batch'
NOTIFICATION_BROADCAST_BATCH_COMPLETED = 'notification.broadcast-batch-completed'

interface NotificationBroadcastBatchEvent {
  broadcastId: string;          // correlates all batches of one broadcast
  batchId: string;              // Kafka partition key → even worker spread
  title: string;
  body: string;
  data?: Record<string, string>;
  eventId?: string;
  tokens: { token: string; userId: string }[];  // up to 500 (FCM multicast limit)
}

interface NotificationBroadcastBatchCompletedEvent {
  broadcastId: string;
  batchId: string;
  processedBy: string;          // worker instance id (INSTANCE_ID ?? os.hostname())
  sent: number;
  failed: number;
  completedAt: Date;
}
```

### Dispatcher — `broadcast()` refactor

`broadcast()` stops sending FCM and stops the giant `createMany`. Instead it:

1. Keyset-paginates `DeviceToken` (`ORDER BY id ASC`, `take 500`, cursor on
   last id) — bounded memory regardless of total count.
2. Emits one `NOTIFICATION_BROADCAST_BATCH` event per page, using `batchId` as
   the message key so Kafka spreads batches across partitions/workers.
3. Returns fast: `{ broadcastId, batches, totalTokens }`.

`broadcastId` = `crypto.randomUUID()`; `batchId` = `${broadcastId}:${pageIndex}`.

### Worker — new `onBroadcastBatch()` consumer

Registered as an `@EventPattern(NOTIFICATION_BROADCAST_BATCH)` handler.
Because all replicas share one Kafka consumer group, each batch is delivered to
exactly one worker. For its ≤500 tokens the worker:

1. Calls existing `sendMulticast()` (dead-token pruning preserved).
2. `createMany` log rows for just those users.
3. Emits `NOTIFICATION_BROADCAST_BATCH_COMPLETED` with
   `processedBy = process.env.INSTANCE_ID ?? os.hostname()` and logs
   `[instance <id>] broadcast <broadcastId> batch <batchId>: sent/failed`.

### notifyFollowers keyset pagination

`notifyFollowers()` currently `findMany`s all follower tokens at once. Apply the
same keyset pagination to its token read so the follower path has no equivalent
memory cliff. (Follower lists are dispatcher-resolved upstream and typically
smaller, so it stays in-handler rather than going through the batch topic.)

### Delivery semantics

At-least-once, matching the existing fire-and-forget pipeline. A redelivered
batch (worker crash before offset commit) may duplicate log rows for that
batch's users. Documented and accepted — no dedup layer added.

## Part B — 4-worker compose scaling

`docker-compose.dev.yml` `notifications` service gains:

```yaml
    deploy:
      replicas: 4
    environment:
      INSTANCE_ID: ...    # left unset → falls back to os.hostname() (unique per replica)
```

- No `container_name` is set, so `replicas: 4` scales cleanly.
- All 4 join the same Kafka consumer group (existing group config) → batches
  are load-balanced across them; each batch's completion event/log identifies
  the instance that handled it via `processedBy`.
- `develop.watch` rebuild rules continue to apply to all replicas.

## Part C — 1M user + device-token seeder

New standalone `scripts/seed-load.ts` (idempotent `seed.ts` untouched):

- Generates user UUIDs in-script via `crypto.randomUUID()` so device tokens can
  reference them.
- **Bulk insert via Postgres `COPY`** (`pg` copy-from stream) into both DBs —
  per-row inserts are far too slow at 1M; COPY completes in seconds-to-minutes.
- Users: `load+{i}@eventfsa.local`, `name = "Load User {i}"`, one shared
  precomputed hash (matching `seed.ts`'s `hashPassword`) so any account can log
  in. Role `user`.
- Device tokens: `token = load-token-{i}`, `userId` = generated uuid,
  `platform` cycled `ios`/`android`/`web`.
- Count configurable via CLI arg (default `1_000_000`). `--fresh` flag deletes
  prior `load+`-prefixed users and `load-token-`-prefixed tokens first so it is
  re-runnable.
- Reads `AUTH_DATABASE_URL` / `NOTIFICATIONS_DATABASE_URL` / `JWT_SECRET` from
  env, run via `node --env-file=.env -r ts-node/register/transpile-only`.

## Files changed / created

| File | Action | Purpose |
|------|--------|---------|
| `libs/shared/src/kafka.contracts.ts` | edit | +2 topics, +2 event interfaces |
| `apps/notifications/src/notifications.service.ts` | edit | dispatcher refactor, `onBroadcastBatch`, keyset paginate |
| `apps/notifications/src/notifications.controller.ts` | edit | `@EventPattern` for batch topic |
| `docker-compose.dev.yml` | edit | `deploy.replicas: 4` + `INSTANCE_ID` |
| `scripts/seed-load.ts` | new | COPY-based 1M seeder |

## Intentional simplifications

- **Token-list-in-message batches (≤500)** instead of cursor-range messages —
  keeps workers stateless (no re-query) and message size well under Kafka's 1MB
  default (~90KB/batch).
- **At-least-once, no dedup** — matches existing pipeline semantics.
- **Instance id from hostname** — no service-discovery/registry; the container
  hostname is already unique per replica.
- **COPY over ORM inserts** for the seeder — the only realistic way to load 1M
  rows quickly; the seeder is a dev/load-test tool, not app code.
