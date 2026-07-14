// Orchestrated broadcast fanout test.
//
// Flow:
//   1. SEED   — register AUDIENCE device tokens across a small user pool.
//   2. FIRE   — POST /notifications/broadcast → 202 + { broadcastId }.
//   3. WATCH  — poll GET /notifications/broadcast-runs/:broadcastId until the run
//               reports status "completed", then record per-worker-instance
//               tallies and aggregate metrics.
//
// analytics-svc consumes the notification.broadcast-dispatched + -batch-completed
// Kafka events emitted by the 4 notifications workers, persists a run record, and
// the gateway proxies it back here — so this test sees WHICH instance handled
// what, and the same data powers the admin "Broadcast activity" view in the web app.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter, Gauge } from 'k6/metrics';
import {
  BASE_URL,
  authHeaders,
  createUser,
  createAdminUser,
  registerToken,
  randomString,
  randomFutureDate,
} from './helpers.js';

const AUDIENCE = Number(__ENV.AUDIENCE || 2000);
const SEED_VUS = Number(__ENV.SEED_VUS || 300);
const USER_POOL = Number(__ENV.USER_POOL || 50);
const WATCH_TIMEOUT_S = Number(__ENV.WATCH_TIMEOUT_S || 120);

const PLATFORMS = ['ios', 'android', 'web'];

const seedRegDuration = new Trend('seed_token_reg_duration', true);
const fanoutSettleMs = new Trend('fanout_settle_ms', true);
const batchesTotal = new Counter('fanout_batches_total');
const sentTotal = new Counter('fanout_sent_total');
const failedTotal = new Counter('fanout_failed_total');
const instancesActive = new Gauge('fanout_instances_active');
const batchesByInstance = new Counter('fanout_batches_by_instance');

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: AUDIENCE,
      maxDuration: '3m',
      exec: 'seedScenario',
    },
    orchestrate: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: `${WATCH_TIMEOUT_S + 30}s`,
      startTime: '3m',
      exec: 'orchestrateScenario',
    },
  },
  thresholds: {
    seed_token_reg_duration: ['p(95)<2000'],
    fanout_settle_ms: [`p(95)<${WATCH_TIMEOUT_S * 1000}`],
    http_req_failed: ['rate<0.05'],
  },
};

function deviceToken(i) {
  return `orchestrated-token-${i}`;
}

export function setup() {
  const users = [];
  for (let i = 0; i < USER_POOL; i++) users.push(createUser(`orch-${i}`));
  const admin = createAdminUser();

  const eventRes = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `Orchestrated broadcast ${randomString(6)}`,
      description: 'Seeded by k6 08-orchestrated-broadcast.',
      date: randomFutureDate(),
    }),
    { headers: authHeaders(admin.token) },
  );
  if (eventRes.status !== 201) {
    fail(`setup: event create failed — ${eventRes.status}: ${eventRes.body}`);
  }
  const eventBody = eventRes.json();
  const eventId = eventBody?.data?.eventId ?? eventBody?.eventId;

  return { users, admin, eventId };
}

export function seedScenario(data) {
  const i = exec.scenario.iterationInTest;
  const user = data.users[i % data.users.length];
  const platform = PLATFORMS[i % PLATFORMS.length];

  const res = registerToken(user.token, user.userId, deviceToken(i), platform);
  seedRegDuration.add(res.timings.duration);
  check(res, { 'seed register token: 201': (r) => r.status === 201 });
  sleep(0.02);
}

function unwrap(body) {
  // Gateway wraps responses as { data: ... } via TransformInterceptor.
  return body?.data ?? body;
}

export function orchestrateScenario(data) {
  const headers = authHeaders(data.admin.token);

  // FIRE the broadcast — response carries the broadcastId to track.
  const fired = http.post(
    `${BASE_URL}/notifications/broadcast`,
    JSON.stringify({
      title: `Orchestrated broadcast ${randomString(6)}`,
      body: 'Fanned out to every registered device.',
      data: { source: 'k6-orchestrated' },
      eventId: data.eventId,
    }),
    { headers, timeout: '15s' },
  );
  check(fired, { 'broadcast accepted (202)': (r) => r.status === 202 });
  const broadcastId = unwrap(fired.json())?.broadcastId;
  if (!broadcastId) {
    fail(`no broadcastId in response: ${fired.body}`);
  }
  const firedAt = Date.now();

  // WATCH — poll the run until analytics marks it completed.
  let run = null;
  const deadline = firedAt + WATCH_TIMEOUT_S * 1000;
  while (Date.now() < deadline) {
    const res = http.get(
      `${BASE_URL}/notifications/broadcast-runs/${broadcastId}`,
      { headers, timeout: '10s' },
    );
    if (res.status === 200) {
      const body = unwrap(res.json());
      if (body && body.status === 'completed') {
        run = body;
        break;
      }
    }
    sleep(1);
  }

  if (!run) {
    console.error(
      `Broadcast ${broadcastId} did not complete within ${WATCH_TIMEOUT_S}s — workers/analytics up?`,
    );
    return;
  }

  const durationMs =
    run.firstCompletionAt && run.completedAt
      ? new Date(run.completedAt) - new Date(run.firstCompletionAt)
      : 0;

  fanoutSettleMs.add(durationMs);
  batchesTotal.add(run.receivedBatches);
  sentTotal.add(run.sent);
  failedTotal.add(run.failed);
  instancesActive.add(run.instanceCount);
  for (const inst of run.instances || []) {
    batchesByInstance.add(inst.batches, { instance: inst.instance });
  }

  const rows = (run.instances || [])
    .map(
      (i) =>
        `  ${i.instance.padEnd(16)}  ${String(i.batches).padStart(6)} batches  ` +
        `${String(i.sent).padStart(8)} sent  ${String(i.failed).padStart(6)} failed`,
    )
    .join('\n');
  console.log(
    `\n── Broadcast ${run.broadcastId} ──\n` +
      `${run.instanceCount} instances · ${run.receivedBatches} batches · ` +
      `${run.sent} sent · ${run.failed} failed · ${(durationMs / 1000).toFixed(1)}s\n${rows}\n`,
  );
}
