# k6 Broadcast Fan-out Load Test — Design

**Date:** 2026-06-30
**Scope:** k6 test scripts only. **No backend changes.**

## Goal

Model the scenario: *100k users exist, one event's notification is fired out to all
100k of them*, and measure how the system handles that fan-out.

## Constraint that shapes the design

The API gateway exposes only these notification-related HTTP routes
([api-gateway.controller.ts](../../../apps/api-gateway/src/api-gateway.controller.ts)):

- `POST /notifications/register-token` — register one device token (idempotent `upsert`)
- `POST /notifications/send` — send to **one** device token

There is **no** `POST /notifications/broadcast` route. The server-side
`broadcast()` / `sendMulticast()` fan-out ([notifications.service.ts:116-183](../../../apps/notifications/src/notifications.service.ts#L116))
is only reachable via an internal Kafka pattern, not over HTTP. Because we are not
touching the backend, **k6 itself acts as the fan-out engine**: the "one event → 100k
users" fan-out is driven as **100k individual `POST /notifications/send` calls**.

This tests the real per-message path under 100k volume:
gateway → Kafka RPC → `send()` → FCM call → Postgres `notificationLog` insert.
It does **not** test the server-side multicast chunking path (unreachable without a route).

## Architecture

**New file:** `k6/07-broadcast-fanout.test.js`
**Modified file:** `k6/helpers.js` — add a `registerToken()` helper.

One script, two sequential scenarios. The audience is addressed by **deterministic
regeneration**: both scenarios derive each device token from its index, so no shared
state or 100k-record handoff is needed.

### Token scheme

```
token(i)  = `device-token-fanout-${i}`        // i in [0, 100000)
```

The seed scenario registers `token(i)`; the fan-out scenario sends to `token(i)`.
Both compute it from the iteration index — no coordination required.

### Scenario 1 — `seed`

- **Executor:** `shared-iterations` — exactly `TOTAL = 100000` iterations across
  `SEED_VUS` (default 300) VUs. Guarantees the full audience is built regardless of speed.
- **Per iteration** (index `i = exec.scenario.iterationInTest`):
  1. Create/get an auth identity (a small shared pool of authenticated users is enough —
     `register-token` only needs *a* valid JWT; the `userId` in the body is what ties the
     token to a user). Each token row carries `userId` = a pool user, `token` = `token(i)`.
  2. `POST /notifications/register-token` with `{ userId, token: token(i), platform }`.
- **Idempotent:** `register-token` upserts on `token` ([notifications.service.ts:190](../../../apps/notifications/src/notifications.service.ts#L190)),
  so re-runs overwrite cleanly.

### Scenario 2 — `fanout`

- **Starts after** scenario 1 via `startTime` (gated past the seed duration).
- **Executor:** `shared-iterations` — `TOTAL = 100000` iterations across `FANOUT_VUS`
  (default 500) VUs. One `POST /notifications/send` per token.
- **Per iteration** (index `i`):
  `POST /notifications/send` with a shared event payload:
  `{ userId, deviceToken: token(i), title: "New Event: <shared>", body: <shared>, eventId: <shared>, data: {...} }`.
  The shared `eventId`/title/body represent *one event* being fanned out to all recipients.

## Configuration (env-driven)

| Env var | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | gateway base (auto-appends `/api/v1`) |
| `AUDIENCE` | `100000` | total users/tokens to seed and fan out to |
| `SEED_VUS` | `300` | parallel VUs for the seed scenario |
| `FANOUT_VUS` | `500` | parallel VUs for the fan-out scenario |
| `USER_POOL` | `50` | distinct authenticated users sharing the seed/fanout work |

`AUDIENCE` lets the test be smoke-run at small scale (e.g. `-e AUDIENCE=1000`) before a
full 100k run.

## Metrics & thresholds

Custom metrics:
- `fanout_send_duration` (Trend) — per-`/send` latency.
- `fanout_accepted` / `fanout_failed` (Counters).
- `seed_token_reg_duration` (Trend) — per-register latency during seeding.
- Total fan-out wall-clock is read from the scenario's run time in the summary.

Thresholds (intentionally tolerant — FCM is **not** configured in the test env, so the
FCM call inside `send()` fails while the API/DB path still executes; mirrors the existing
[03-notifications.test.js](../../../k6/03-notifications.test.js#L56) tolerance):
- `seed_token_reg_duration: p(95)<2000`
- `fanout_send_duration: p(95)<5000, p(99)<10000`
- `http_req_failed: rate<0.05` (transport-level failures only)
- Send-level "FCM failed" is tracked, not failed-on.

## What this test deliberately does NOT do

- It does **not** add or call a broadcast/multicast HTTP route (no backend changes).
- It does **not** test server-side 500-token FCM chunking ([notifications.service.ts:125](../../../apps/notifications/src/notifications.service.ts#L125)) — unreachable over HTTP today.
- True 100k *concurrency* still requires distributed k6 (ephemeral-port/FD limits on a
  single load generator). This script defines the workload; running it at full 100k is an
  infra concern (k6 Cloud / k6 Operator) noted but out of scope here.

## Follow-up (out of scope, noted)

Adding `POST /notifications/broadcast` to the gateway would let a single call exercise the
real server-side multicast path — a more efficient and realistic broadcast test. Recorded
here as a future enhancement; not part of this k6-only change.
