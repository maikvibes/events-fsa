import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, authHeaders, createUser, randomFutureDate, randomString } from './helpers.js';

const spikeDuration = new Trend('spike_req_duration', true);
const spikeErrors = new Rate('spike_error_rate');
const spike5xx = new Counter('spike_5xx_count');

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '10s', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '10s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    spike_req_duration: ['p(95)<8000', 'p(99)<15000'],
    spike_error_rate: ['rate<0.05'],
    spike_5xx_count: ['count<100'],
    http_req_failed: ['rate<0.05'],
  },
};

export function setup() {
  const users = [];
  for (let i = 0; i < 20; i++) {
    users.push(createUser(`spike-${i}`));
  }
  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  const roll = Math.random();

  let res;

  if (roll < 0.60) {
    res = http.get(`${BASE_URL}/events/me`, { headers });

    check(res, { 'spike list: 200': (r) => r.status === 200 });
  } else if (roll < 0.85) {
    res = http.post(
      `${BASE_URL}/events`,
      JSON.stringify({
        title: `Spike ${randomString(6)}`,
        description: `Spike test event ${randomString(20)}`,
        date: randomFutureDate(),
      }),
      { headers },
    );

    check(res, { 'spike create: 201': (r) => r.status === 201 });
  } else {
    res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: 'Password123!' }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    check(res, { 'spike login: 200 or 201': (r) => r.status === 200 || r.status === 201 });
  }

  spikeDuration.add(res.timings.duration);

  if (res.status >= 500) spike5xx.add(1);
  spikeErrors.add(res.status >= 400 && res.status !== 404 ? 1 : 0);

  sleep(Math.random() * 0.1);
}
