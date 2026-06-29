/**
 * Events CRUD load test — simulates authenticated users creating, reading,
 * updating, and deleting events at realistic read/write ratios (70/30).
 *
 * Flow per VU iteration:
 *   1. POST /events          → create
 *   2. GET  /events/:id      → fetch single (cache miss first time)
 *   3. GET  /events/:id      → fetch single again (should hit Redis cache)
 *   4. PUT  /events/:id      → update (invalidates cache)
 *   5. GET  /events/me       → list user events
 *   6. DELETE /events/:id    → delete
 *
 * This stresses:
 *   - Kafka RPC round-trips (api-gateway → events-svc)
 *   - Redis cache hit/miss ratio
 *   - PostgreSQL write throughput
 */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, JSON_HEADERS, authHeaders, createUser, randomFutureDate, randomString } from './helpers.js';

const createDuration = new Trend('events_create_duration', true);
const readDuration = new Trend('events_read_duration', true);
const cacheHitDuration = new Trend('events_cache_hit_duration', true);
const updateDuration = new Trend('events_update_duration', true);
const listDuration = new Trend('events_list_duration', true);
const deleteDuration = new Trend('events_delete_duration', true);
const eventErrors = new Rate('events_error_rate');

export const options = {
  scenarios: {
    events_crud: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 200 },
        { duration: '3m', target: 500 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    events_create_duration: ['p(95)<3000', 'p(99)<6000'],
    events_read_duration: ['p(95)<1000', 'p(99)<2000'],
    events_cache_hit_duration: ['p(95)<300'],
    events_update_duration: ['p(95)<3000'],
    events_list_duration: ['p(95)<1500'],
    events_delete_duration: ['p(95)<3000'],
    events_error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.02'],
  },
};

export function setup() {
  // Create a pool of 10 users to share across VUs.
  const users = [];
  for (let i = 0; i < 10; i++) {
    users.push(createUser(`crud-${i}`));
  }
  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);
  let allOk = true;

  // --- CREATE ---
  const createRes = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `Event ${randomString(6)}`,
      description: `Description for load test event ${randomString(12)}`,
      date: randomFutureDate(),
    }),
    { headers },
  );
  createDuration.add(createRes.timings.duration);

  const created = check(createRes, {
    'create event: status 201': (r) => r.status === 201,
    'create event: has eventId': (r) => {
      try {
        const b = r.json();
        return !!(b?.data?.eventId ?? b?.eventId);
      } catch {
        return false;
      }
    },
  });
  if (!created) {
    allOk = false;
    eventErrors.add(1);
    sleep(0.5);
    return;
  }

  const eventBody = createRes.json();
  const eventId = eventBody?.data?.eventId ?? eventBody?.eventId;

  sleep(0.1);

  // --- READ (cache miss — first fetch after create) ---
  const readRes = http.get(`${BASE_URL}/events/${eventId}`, { headers });
  readDuration.add(readRes.timings.duration);

  const read = check(readRes, {
    'read event: status 200': (r) => r.status === 200,
    'read event: correct id': (r) => {
      try {
        const b = r.json();
        return (b?.data?.eventId ?? b?.eventId) === eventId;
      } catch {
        return false;
      }
    },
  });
  if (!read) allOk = false;

  sleep(0.05);

  // --- READ AGAIN (cache hit — Redis TTL is 30 min) ---
  const cacheRes = http.get(`${BASE_URL}/events/${eventId}`, { headers });
  cacheHitDuration.add(cacheRes.timings.duration);

  // We don't compare cacheRes vs readRes per-iteration — two single live
  // samples flap badly under load. Cache effectiveness is judged in aggregate
  // via the events_cache_hit_duration threshold (p95<300ms) instead.
  check(cacheRes, {
    'cache hit: status 200': (r) => r.status === 200,
  });

  sleep(0.1);

  // --- UPDATE ---
  const updateRes = http.put(
    `${BASE_URL}/events/${eventId}`,
    JSON.stringify({ title: `Updated ${randomString(6)}`, date: randomFutureDate(60) }),
    { headers },
  );
  updateDuration.add(updateRes.timings.duration);

  check(updateRes, { 'update event: status 200': (r) => r.status === 200 });

  sleep(0.1);

  // --- LIST USER EVENTS ---
  const listRes = http.get(`${BASE_URL}/events/me`, { headers });
  listDuration.add(listRes.timings.duration);

  check(listRes, {
    'list events: status 200': (r) => r.status === 200,
    'list events: is array': (r) => {
      try {
        const b = r.json();
        return Array.isArray(b?.data ?? b);
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);

  // --- DELETE ---
  const deleteRes = http.del(`${BASE_URL}/events/${eventId}`, null, { headers });
  deleteDuration.add(deleteRes.timings.duration);

  check(deleteRes, { 'delete event: status 200': (r) => r.status === 200 });

  eventErrors.add(!allOk ? 1 : 0);

  sleep(Math.random() * 0.5 + 0.2);
}
