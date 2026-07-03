import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter } from 'k6/metrics';
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
// Each call fans out server-side to the *entire* seeded audience via FCM
// multicast, so this stays small — it's a load test of the broadcast
// trigger path, not a multiplier on top of the seeded fan-out.
const BROADCAST_CALLS = Number(__ENV.BROADCAST_CALLS || 5);

const PLATFORMS = ['ios', 'android', 'web'];

const seedRegDuration = new Trend('seed_token_reg_duration', true);
const broadcastSendDuration = new Trend('broadcast_send_duration', true);
const broadcastAccepted = new Counter('broadcast_accepted');
const broadcastFailed = new Counter('broadcast_failed');

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: AUDIENCE,
      maxDuration: '2m',
      exec: 'seedScenario',
    },
    broadcast: {
      executor: 'shared-iterations',
      vus: Math.min(BROADCAST_CALLS, 10),
      iterations: BROADCAST_CALLS,
      maxDuration: '1m',
      startTime: '2m',
      exec: 'broadcastScenario',
    },
  },
  thresholds: {
    seed_token_reg_duration: ['p(95)<2000'],
    broadcast_send_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

function deviceToken(i) {
  return `device-token-fanout-${i}`;
}

export function setup() {
  const users = [];
  for (let i = 0; i < USER_POOL; i++) {
    users.push(createUser(`fanout-${i}`));
  }
  const admin = createAdminUser();

  // Real event so the broadcast can be linked via eventId, matching how an
  // admin would announce an actual event to every registered user.
  const eventRes = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `Broadcast fanout event ${randomString(6)}`,
      description: 'Seeded by k6 07-broadcast-fanout for eventId-linked broadcasts.',
      date: randomFutureDate(),
    }),
    { headers: authHeaders(admin.token) },
  );
  if (eventRes.status !== 201) {
    fail(`setup: event create failed — status ${eventRes.status}, body: ${eventRes.body}`);
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
  check(res, { 'seed register token: status 201': (r) => r.status === 201 });

  sleep(0.05);
}

export function broadcastScenario(data) {
  const res = http.post(
    `${BASE_URL}/notifications/broadcast`,
    JSON.stringify({
      title: `Broadcast ${randomString(6)}`,
      body: 'A new event has been published to all users.',
      data: { source: 'k6-broadcast-fanout' },
      eventId: data.eventId,
    }),
    { headers: authHeaders(data.admin.token), timeout: '15s' },
  );

  broadcastSendDuration.add(res.timings.duration);

  const accepted = check(res, {
    'broadcast: status 202': (r) => r.status === 202,
    'broadcast: accepted true': (r) => {
      try {
        const b = r.json();
        return (b?.data ?? b)?.accepted === true;
      } catch {
        return false;
      }
    },
  });

  if (accepted) broadcastAccepted.add(1);
  else broadcastFailed.add(1);

  sleep(0.5);
}
