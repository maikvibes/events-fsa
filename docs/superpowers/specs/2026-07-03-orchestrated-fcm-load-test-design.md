# Orchestrated FCM Fanout Load Test — Design Spec

## Goal

Measure real FCM broadcast fanout speed across 100k users using k6 workers that
register with the API gateway, trigger a broadcast, and record round-trip time
(RTT) to an orchestrator that bridges the async notification pipeline.

## Current state (context)

- `POST /notifications/broadcast` (api-gateway) is fire-and-forget — emits a
  Kafka `notification.broadcast` event and returns 202 immediately.
- The notifications service consumes the event, runs `broadcast()` which queries
  all device tokens from Postgres, then fans out via `sendMulticast()` in batches
  of 500 (`sendEachForMulticast` to Firebase).
- k6 can't receive real FCM pushes (no browser/device push channel). The
  orchestrator bridges this gap by consuming a completion event from Kafka and
  forwarding results back to k6 workers via HTTP polling.

## Scope

Three changes to existing code, one new NestJS app, one new k6 test script:

1. **Notifications service** — `broadcast()` records timing and emits one
   `notification.broadcast-completed` Kafka event on completion.
2. **Orchestrator** (new NestJS hybrid app) — HTTP server for k6 polling,
   Kafka consumer for completion events, in-memory test-state tracking.
3. **k6 test script** — VUs register fake tokens, trigger broadcast, poll
   orchestrator for results, record RTT metrics.

Out of scope: real FCM delivery measurement (needs browsers), per-batch
streaming events (one completion event is sufficient), WebSocket (HTTP polling
is simpler, no new dependencies), Redis cache, `@nestjs/schedule`, seed script
(k6's existing helpers already handle token registration).

## Orchestrator endpoints

```
POST /test/register       Body: { testId: string }
→ orchestrator remembers this testId, starts watching for its completion event
→ returns 201

GET  /test/:testId
→ 200 + { totalTokens, sent, failed, totalMs } if completed
→ 404 if still pending

GET  /test/:testId/health
→ 200 { status: "ok" } — health check
```

## Flow

```
1. SEED   — k6 VUs register 100k fake tokens via POST /notifications/register-token
2. REGISTER — k6 VU calls POST /test/register { testId }
3. TRIGGER — k6 VU calls POST /notifications/broadcast { data: { testId } }
             (gateway emits Kafka event, returns 202)
             k6 records triggerTime = Date.now()
4. PROCESS — notifications service:
             - SELECT tokens from DB
             - for each batch of 500: sendEachForMulticast()
             - emit notification.broadcast-completed { testId, totalTokens, totalMs, ... }
5. MATCH   — orchestrator Kafka consumer receives the event,
             stores result against testId
6. POLL    — k6 VU polls GET /test/:testId every 1s
             200 → RTT = triggerTime → now (or use result.totalMs for pipeline-only)
7. REPORT  — k6 outputs fanout_time_ms, tokens_per_second, end_to_end_rtt_ms
```

## Contracts

### New Kafka topic

```typescript
KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED = 'notification.broadcast-completed'

interface NotificationBroadcastCompletedEvent {
  testId?: string;
  totalTokens: number;
  sent: number;
  failed: number;
  totalMs: number;
  completedAt: Date;
}
```

### Test ID correlation

The `testId` flows through the `data` field of the broadcast request body,
through `NotificationBroadcastEvent.data`, into `BroadcastDto.data`, and is
extracted by the notifications service to include in the completion event.

## Files changed/created

| File | Action | Purpose |
|------|--------|---------|
| `libs/shared/src/kafka.contracts.ts` | +8 lines | Add topic + event interface |
| `apps/notifications/src/notifications.service.ts` | +15 lines | Timing + emit in broadcast() |
| `nest-cli.json` | +8 lines | Add orchestrator project entry |
| `apps/orchestrator/tsconfig.app.json` | New | Build config (copied from notifications) |
| `apps/orchestrator/src/main.ts` | New | Hybrid NestJS bootstrap (HTTP + Kafka) |
| `apps/orchestrator/src/orchestrator.module.ts` | New | Module with HTTP controller + Kafka consumer |
| `apps/orchestrator/src/orchestrator.controller.ts` | New | POST /test/register, GET /test/:testId |
| `apps/orchestrator/src/orchestrator.service.ts` | New | Kafka consumer + test state Map |
| `k6/08-orchestrated-fanout.test.js` | New | Seeding + broadcast + polling |

Total: ~180 lines of logic, ~50 lines of config boilerplate.

## Intentional simplifications

- **HTTP polling instead of WebSocket** — polling is one `GET` request per
  second, simpler than maintaining WebSocket connections in k6. No `ws`/socket.io
  dependency. The 1-second polling granularity is noise compared to 30-60s
  broadcast times.
- **In-memory Map for test state** — test results are ephemeral. No database
  or Redis. A test would be re-run if the orchestrator restarts during it.
- **No per-batch streaming** — one completion event covers the need. Per-batch
  granularity doesn't change the RTT measurement meaningfully.
- **Fake tokens** — tokens are `device-token-fanout-{i}`. Firebase rejects
  them fast (~20ms), pipeline timing is unaffected, no quota burned.
