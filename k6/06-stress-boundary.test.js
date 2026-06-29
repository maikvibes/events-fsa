/**
 * Stress / boundary test — finds the breaking point of the system.
 *
 * Ramps VUs until thresholds breach or the system starts returning errors.
 * Useful for establishing the actual ceiling before applying horizontal scaling.
 *
 * Stages: keep ramping until p99 latency > 10s or error rate > 5%.
 * The test does NOT abort early — let it run to completion and read the
 * threshold summary to find which stage the system degraded.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, authHeaders, createUser, randomFutureDate, randomString } from './helpers.js';

const stressDuration = new Trend('stress_req_duration', true);
const stressErrors = new Rate('stress_error_rate');
const stress5xx = new Counter('stress_5xx_count');
const kafkaTimeouts = new Counter('stress_kafka_timeout_count');

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 500 },
        { duration: '2m', target: 800 },
        { duration: '2m', target: 1000 },
        { duration: '2m', target: 1500 },
        // Cool-down — verifies recovery, not just failure.
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    // These are intentionally soft — the goal is to OBSERVE the breaking point,
    // not prevent the test from running to the end.
    stress_req_duration: ['p(95)<10000'],
    stress_error_rate: ['rate<0.10'],
    http_req_failed: ['rate<0.10'],
  },
};

export function setup() {
  const users = [];
  for (let i = 0; i < 30; i++) {
    users.push(createUser(`stress-${i}`));
  }
  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  // Alternate between the two most expensive operations:
  // - Event create (Postgres write + Kafka RPC + Kafka publish to notifications)
  // - Event list (Redis cache lookup + Postgres fallback)
  const writeHeavy = __ITER % 3 !== 0;

  let res;

  if (writeHeavy) {
    res = http.post(
      `${BASE_URL}/events`,
      JSON.stringify({
        title: `Stress ${randomString(6)}`,
        description: `Stress test event to find system ceiling`,
        date: randomFutureDate(),
      }),
      { headers, timeout: '15s' },
    );

    check(res, { 'stress create: not 5xx': (r) => r.status < 500 });
  } else {
    res = http.get(`${BASE_URL}/events/me`, { headers, timeout: '15s' });

    check(res, { 'stress list: not 5xx': (r) => r.status < 500 });
  }

  stressDuration.add(res.timings.duration);

  if (res.status >= 500) stress5xx.add(1);

  // Detect Kafka RPC timeouts — gateway returns 504 or body contains "timeout".
  if (res.status === 504 || (res.body && res.body.includes('timeout'))) {
    kafkaTimeouts.add(1);
  }

  stressErrors.add(res.status >= 500 ? 1 : 0);

  sleep(Math.random() * 0.2);
}
