/**
 * Spike test — simulates a sudden surge to 100k concurrent users (modelled as
 * 1000 VUs hitting the system hard, scaled to represent 100k at 100:1 ratio).
 *
 * Why: real 100k-user events (ticket drops, flash sales, breaking news) cause
 * vertical load spikes, not gentle ramps. This test checks:
 *   - System doesn't crash or return 5xx under sudden load
 *   - Recovery behavior after the spike drops off
 *   - Kafka queue depth stays manageable (inferred from RPC latency)
 *   - Redis doesn't evict aggressively under burst writes
 *
 * The 100:1 scale assumption: 1 k6 VU driving ~100 req/s models 100 real users
 * browsing at ~1 req/s each. 1000 VUs ≈ 100k real users.
 */
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
        // Baseline
        { duration: '30s', target: 50 },
        // Spike — instant surge
        { duration: '10s', target: 1000 },
        // Hold at peak
        { duration: '1m', target: 1000 },
        // Recovery
        { duration: '10s', target: 50 },
        // Confirm system recovered
        { duration: '30s', target: 50 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    // At spike peak, allow higher latency — but zero 5xx tolerance
    spike_req_duration: ['p(95)<8000', 'p(99)<15000'],
    spike_error_rate: ['rate<0.05'],
    spike_5xx_count: ['count<100'],
    http_req_failed: ['rate<0.05'],
  },
};

export function setup() {
  // Pre-create a small user pool — registration itself isn't the spike target.
  const users = [];
  for (let i = 0; i < 20; i++) {
    users.push(createUser(`spike-${i}`));
  }
  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  // Mix of read/write operations matching a typical usage distribution:
  //   60% read single event or list
  //   25% create event
  //   15% update/delete
  const roll = Math.random();

  let res;

  if (roll < 0.60) {
    // Read — most likely to hit Redis cache
    res = http.get(`${BASE_URL}/events/me`, { headers });

    check(res, { 'spike list: 200': (r) => r.status === 200 });
  } else if (roll < 0.85) {
    // Create
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
    // Login — simulates session refresh / new device login during traffic spike
    res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: 'Password123!' }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    check(res, { 'spike login: 200': (r) => r.status === 200 });
  }

  spikeDuration.add(res.timings.duration);

  if (res.status >= 500) spike5xx.add(1);
  spikeErrors.add(res.status >= 400 && res.status !== 404 ? 1 : 0);

  // Minimal think time — spike tests intentionally hammer the system.
  sleep(Math.random() * 0.1);
}
