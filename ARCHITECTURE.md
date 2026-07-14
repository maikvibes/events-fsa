# Architecture Overview

Event-driven microservices monorepo (NestJS + Nx). Services communicate
synchronously over the API gateway (HTTP) and asynchronously over Kafka. Each
service owns its own Postgres database (database-per-service); no service reads
another's tables directly.

## Services

| Service | Transport | Port (host) | Owns | Responsibility |
|---|---|---|---|---|
| `api-gateway` | HTTP | 3000 | — | Public REST API, auth guard, request → microservice bridge, fire-and-forget Kafka emits |
| `auth` | Kafka | — | `auth` DB (`User`, `RefreshToken`) | Registration, login, JWT issue/refresh, roles |
| `events` | Kafka | — | `events` DB (`Event`, `EventFollow`) | Event CRUD, follower resolution, follower-fanout emits |
| `notifications` | Kafka | — | `notifications` DB (`DeviceToken`, `NotificationLog`) | FCM push, device-token registry, broadcast fanout — **runs 4 replicas** |
| `analytics` | Kafka | — | `analytics` DB (`BroadcastRun`, `BroadcastInstanceStat`) | Consumes broadcast dispatched/completion events, persists per-instance run history; served to the web app via the gateway |
| `frontend` | HTTP | 32141 | — | Web admin / client |

Infra: `kafka` (broker, `29092`), `postgres` (`5432`), `redis`, `migrate`
(one-shot Prisma migrate on startup).

## Message flow — event creation → push

```
client ──HTTP──▶ api-gateway ──Kafka(event.created)──▶ events-svc
                                                          │ persists Event
                                                          ▼
                              notifications-svc ◀──Kafka(event.created)
                                 │ resolves the creator's device tokens
                                 ▼ FCM push + NotificationLog
```

Follower fanout (update / delete / announcement / reminder): events-svc owns
`EventFollow`, so it resolves `followerUserIds` itself and emits an
`EventFollowerNotifyEvent` on the relevant topic; notifications-svc never
queries events-svc's DB. See `libs/shared/src/kafka.contracts.ts`.

## Broadcast fanout (batched, queue + worker)

An admin broadcast to **all** users is decomposed so no single process ever
loads every device token into memory:

```
admin ─HTTP─▶ api-gateway ─Kafka(notification.broadcast)─▶ notifications (dispatcher)
                                                             │ keyset-paginate DeviceToken (500/page)
                                                             │ emit N × notification.broadcast-batch
                                                             ▼
                        ┌──────────────── Kafka topic: notification.broadcast-batch (4 partitions)
                        │            │            │            │
                     worker#1     worker#2     worker#3     worker#4     ← 4 replicas, one consumer group
                        │            │            │            │
                        ▼            ▼            ▼            ▼
                   FCM multicast (≤500) + NotificationLog per user
                        │            │            │            │
                        └── emit notification.broadcast-dispatched (totals) ──────┐
                        └── emit notification.broadcast-batch-completed ──────────┤
                                     (stamped with processedBy = hostname)        ▼
                                                                              analytics-svc
                                                          persist BroadcastRun + per-instance stats
                                                          (analytics DB) ──▶ gateway ──▶ web app
```

Key points:

- **Dispatcher vs. worker** (`apps/notifications/src/notifications.service.ts`):
  `broadcast()` only paginates + emits batch events; `onBroadcastBatch()` does
  the FCM send + logging. A crash mid-fanout only redelivers the affected batch,
  not the whole broadcast.
- **Parallelism** comes from a Kafka consumer group + partitioned topic. The dev
  broker default is bumped to **4 partitions** (`KAFKA_NUM_PARTITIONS`) so all 4
  worker replicas stay busy; `batchId` is the message key for even spread.
- **Instance attribution**: each worker stamps completions with
  `INSTANCE_ID ?? os.hostname()` (unique per replica), so analytics-svc can show
  exactly which instance handled which batches.
- **Run history**: `analytics-svc` consumes the dispatched + completion events
  into its own `analytics` DB. It knows the run is finished deterministically
  (`receivedBatches === totalBatches`), not by an idle timeout. The gateway
  proxies run queries to it over Kafka request/reply (`AnalyticsPatterns`), and
  the admin "Broadcast fanout activity" panel renders the per-instance bars.
- **Delivery semantics**: at-least-once. A redelivered batch may duplicate log
  rows for its users — accepted, matching the existing fire-and-forget pipeline.

## Kafka topics

Defined in `libs/shared/src/kafka.contracts.ts`. Notable additions for batched
delivery:

- `notification.broadcast` — admin broadcast request (dispatcher input).
- `notification.broadcast-batch` — one page of ≤500 tokens (worker input).
- `notification.broadcast-dispatched` — run totals, emitted once the dispatcher
  finishes paging (analytics input).
- `notification.broadcast-batch-completed` — per-batch result stamped with the
  processing instance (analytics input).

## Data ownership

```
auth DB          events DB           notifications DB      analytics DB
├─ User          ├─ Event            ├─ DeviceToken        ├─ BroadcastRun
└─ RefreshToken  └─ EventFollow      └─ NotificationLog    └─ BroadcastInstanceStat
```

Cross-service data is passed in Kafka event payloads, never by cross-DB queries.
