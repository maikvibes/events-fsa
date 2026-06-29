/**
 * Soak (endurance) test — runs at sustained moderate load for 30 minutes.
 *
 * Why: memory leaks, Kafka consumer lag drift, and Redis key accumulation
 * are invisible in short tests. A soak test catches:
 *   - NestJS process memory growth (Node.js heap leaks)
 *   - Kafka consumer group rebalancing under sustained load
 *   - Postgres connection pool exhaustion (pg pool default is 10)
 *   - Redis key TTL drift (cache growing unbounded)
 *   - P99 latency creep over time (first 5 min vs last 5 min)
 *
 * Run with: k6 run --out json=soak-results.json k6/05-soak.test.js
 * Then compare p99 of first vs last 5-minute windows in the JSON output.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, authHeaders, createUser, randomFutureDate, randomString } from './helpers.js';

const soakDuration = new Trend('soak_req_duration', true);
const soakErrors = new Rate('soak_error_rate');

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30m',
    },
  },
  thresholds: {
    // P99 must stay consistent — any creep signals a memory/connection leak.
    soak_req_duration: ['p(95)<2000', 'p(99)<4000'],
    soak_error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const users = [];
  for (let i = 0; i < 20; i++) {
    users.push(createUser(`soak-${i}`));
  }
  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  // Full CRUD cycle — creates accumulation in Postgres + Redis over 30 min.
  const createRes = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `Soak ${randomString(6)}`,
      description: `Soak test event — verifying no memory leak over 30m`,
      date: randomFutureDate(),
    }),
    { headers },
  );

  soakDuration.add(createRes.timings.duration);
  const ok1 = check(createRes, { 'soak create: 201': (r) => r.status === 201 });

  if (!ok1) {
    soakErrors.add(1);
    sleep(1);
    return;
  }

  const eventId = (() => {
    try {
      const b = createRes.json();
      return b?.data?.eventId ?? b?.eventId;
    } catch {
      return null;
    }
  })();

  sleep(0.2);

  // Read — triggers cache population.
  const readRes = http.get(`${BASE_URL}/events/${eventId}`, { headers });
  soakDuration.add(readRes.timings.duration);
  check(readRes, { 'soak read: 200': (r) => r.status === 200 });

  sleep(0.2);

  // List — exercises user-scoped cache key.
  const listRes = http.get(`${BASE_URL}/events/me`, { headers });
  soakDuration.add(listRes.timings.duration);
  check(listRes, { 'soak list: 200': (r) => r.status === 200 });

  sleep(0.2);

  // Cleanup — prevents unbounded DB growth during 30m run.
  if (eventId) {
    const delRes = http.del(`${BASE_URL}/events/${eventId}`, null, { headers });
    soakDuration.add(delRes.timings.duration);
    check(delRes, { 'soak delete: 200': (r) => r.status === 200 });
  }

  soakErrors.add(0);

  // Realistic think time — 100 VUs * ~3s cycle ≈ ~33 req/s sustained throughput.
  sleep(Math.random() * 2 + 1);
}
