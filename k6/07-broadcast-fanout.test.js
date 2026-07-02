import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, authHeaders, createUser, registerToken, randomString } from './helpers.js';

const AUDIENCE = Number(__ENV.AUDIENCE || 100000);
const SEED_VUS = Number(__ENV.SEED_VUS || 300);
const FANOUT_VUS = Number(__ENV.FANOUT_VUS || 500);
const USER_POOL = Number(__ENV.USER_POOL || 50);

const PLATFORMS = ['ios', 'android', 'web'];
const SHARED_EVENT_ID = '00000000-0000-4000-8000-000000000001';

const seedRegDuration = new Trend('seed_token_reg_duration', true);
const fanoutSendDuration = new Trend('fanout_send_duration', true);
const fanoutAccepted = new Counter('fanout_accepted');
const fanoutFailed = new Counter('fanout_failed');

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: AUDIENCE,
      maxDuration: '60m',
      exec: 'seedScenario',
    },
    fanout: {
      executor: 'shared-iterations',
      vus: FANOUT_VUS,
      iterations: AUDIENCE,
      maxDuration: '60m',
      startTime: '15m',
      exec: 'fanoutScenario',
    },
  },
  thresholds: {
    seed_token_reg_duration: ['p(95)<2000'],
    fanout_send_duration: ['p(95)<5000', 'p(99)<10000'],
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
  return { users };
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

export function fanoutScenario(data) {
  const i = exec.scenario.iterationInTest;
  const user = data.users[i % data.users.length];

  const res = http.post(
    `${BASE_URL}/notifications/send`,
    JSON.stringify({
      userId: user.userId,
      deviceToken: deviceToken(i),
      title: `New Event: Broadcast ${randomString(6)}`,
      body: 'A new event has been published to all users.',
      eventId: SHARED_EVENT_ID,
      data: { eventId: SHARED_EVENT_ID, source: 'k6-broadcast-fanout' },
    }),
    { headers: authHeaders(user.token), timeout: '15s' },
  );

  fanoutSendDuration.add(res.timings.duration);

  const accepted = check(res, {
    'fanout send: not 5xx': (r) => r.status < 500,
  });

  if (accepted) fanoutAccepted.add(1);
  else fanoutFailed.add(1);
}
