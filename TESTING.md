# Testing Guide

Covers unit/integration tests, the load-test seeder, and the k6 performance
suite — including the orchestrated broadcast-fanout test with its live
per-worker dashboard.

## Prerequisites

- Docker + Docker Compose (dev stack)
- Node 22+ and `npm ci`
- [k6](https://k6.io/docs/get-started/installation/) on PATH (for load tests)
- A `.env` (see `.env.example`); local secrets in gitignored `.env.local`

## Unit & integration tests (Jest)

```bash
npx nx test notifications        # one project
npx nx run-many -t test          # all projects
npx nx affected -t test          # only what changed
```

## Bringing up the dev stack

```bash
npm run docker:up                # build + start all services (incl. 4 notifications workers + analytics)
docker compose -f docker-compose.dev.yml ps
```

- API gateway: http://localhost:3000
- Web app (admin broadcast activity): http://localhost:32141

Confirm the 4 workers are running:

```bash
docker compose -f docker-compose.dev.yml ps notifications   # expect 4 replicas
```

## Load-seeding 1M users + device tokens

`scripts/seed-load.ts` bulk-inserts users (auth DB) and one device token per
user (notifications DB) via `UNNEST`-based inserts — the only realistic way to
load a million rows quickly.

```bash
npm run seed:load                       # 1,000,000 (default)
npm run seed:load -- 100000             # custom count
npm run seed:load -- 100000 --fresh     # delete prior load-seed rows first
```

- Users: `load+{i}@eventfsa.local`, shared password `Seed-Pass123` (login-able).
- Device tokens: `load-token-{i}`, platform cycled ios/android/web.
- `--fresh` removes rows matching `load+%@eventfsa.local` / `load-token-%`.

> These are fake FCM tokens; Firebase rejects them fast, so pipeline timing is
> measured without burning quota or delivering real pushes.

## k6 performance suite

Scripts live in `k6/`; each has an `npm run k6:*` wrapper that loads env and
runs cleanup afterward.

| Command | Script | Focus |
|---|---|---|
| `npm run k6:auth` | `01-auth` | Register / login throughput |
| `npm run k6:events` | `02-events-crud` | Event CRUD |
| `npm run k6:notifications` | `03-notifications` | Token registration + direct send |
| `npm run k6:spike` | `04-spike` | Spike load |
| `npm run k6:soak` | `05-soak` | Sustained load |
| `npm run k6:stress` | `06-stress-boundary` | Breaking-point |
| `npm run k6:broadcast` | `07-broadcast-fanout` | Broadcast trigger path |
| `npm run k6:orchestrated` | `08-orchestrated-broadcast` | **Batched fanout across 4 workers, with per-instance tally** |
| `npm run k6:all` | 01–07 | Full suite |

## Orchestrated broadcast test (the batched-delivery e2e)

Exercises the full dispatcher → 4 workers → analytics pipeline and shows which
worker instance handled how many batches. The same data powers the admin
**Broadcast fanout activity** panel in the web app.

**1. Stack up** (workers + analytics must be running):

```bash
npm run docker:up
```

**2. Seed an audience** (device tokens to fan out to):

```bash
npm run seed:load -- 50000            # or rely on the test's own AUDIENCE seeding
```

**3. Watch it live in the web app**: sign in as an admin and open the broadcast
panel — the activity view updates in real time as workers report completions.

**4. Run the test**:

```bash
npm run k6:orchestrated
# tunables:
AUDIENCE=5000 SEED_VUS=300 WATCH_TIMEOUT_S=120 npm run k6:orchestrated
```

What it does:

1. **Seed** — registers `AUDIENCE` device tokens across a small user pool.
2. **Fire** — `POST /notifications/broadcast` → `202 { broadcastId }`.
3. **Watch** — polls `GET /notifications/broadcast-runs/:broadcastId` until the
   run reports `status: "completed"` (analytics flips it once
   `receivedBatches === totalBatches`), then records metrics and logs a
   per-instance table.

### Reading the results

**Web app** — the admin *Broadcast fanout activity* panel shows live tiles
(instances, batches, sent, failed, tokens), a bar per worker instance, and a
run-history list.

**k6 console** — a per-instance tally, e.g.:

```
── Broadcast 3f2a… ──
4 instances · 100 batches · 49,987 sent · 13 failed · 6.4s
  notifications-1     26 batches     12994 sent      3 failed
  notifications-2     25 batches     12480 sent      5 failed
  notifications-3     25 batches     12511 sent      2 failed
  notifications-4     24 batches     12002 sent      3 failed
```

Roughly even batch counts across the 4 instances = the consumer group is
balancing correctly across the 4 topic partitions.

**Run history** — persisted in the `analytics` DB; query any past run via
`GET /notifications/broadcast-runs` (list) or `/:broadcastId` (detail).

### Custom metrics emitted

- `fanout_settle_ms` — wall-clock from first to last batch completion
- `fanout_batches_total`, `fanout_sent_total`, `fanout_failed_total`
- `fanout_instances_active` — distinct worker instances that did work
- `fanout_batches_by_instance` — counter tagged `{instance}`

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Run never reaches `completed` | analytics-svc down, or the dispatched event never arrived — check `docker compose logs analytics` |
| Only 1 instance shows batches | Fewer topic partitions than workers — check `KAFKA_NUM_PARTITIONS` (should be ≥4) |
| Activity panel empty during run | Workers not consuming — check `docker compose logs notifications` |
| Fanout never settles | Raise `WATCH_TIMEOUT_S`; verify FCM creds don't block the send path |

## Cleaning up

```bash
npm run k6:cleanup               # remove k6-created test users
npm run seed:load -- 0 --fresh   # remove load-seed rows
npm run docker:down              # tear down stack + volumes
```
