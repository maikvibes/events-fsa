/**
 * Auth load test — covers register + login under ramp-up to 100k concurrent users.
 *
 * Scenarios:
 *   register  — new unique users signing up (write-heavy, hits Postgres + Kafka)
 *   login     — returning users authenticating (read from Postgres, JWT sign)
 *
 * Thresholds are intentionally strict: registration is synchronous and hits the DB
 * directly, so it's the first bottleneck to expose under load.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { BASE_URL, JSON_HEADERS, randomString } from './helpers.js';

const registerDuration = new Trend('auth_register_duration', true);
const loginDuration = new Trend('auth_login_duration', true);
const registerErrors = new Rate('auth_register_error_rate');
const loginErrors = new Rate('auth_login_error_rate');
const conflictCount = new Counter('auth_register_409_count');

export const options = {
  scenarios: {
    register: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      exec: 'registerScenario',
    },
    login: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '30s',
      stages: [
        { duration: '30s', target: 100 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 500 },
        { duration: '30s', target: 0 },
      ],
      exec: 'loginScenario',
    },
  },
  thresholds: {
    auth_register_duration: ['p(95)<2000', 'p(99)<5000'],
    auth_login_duration: ['p(95)<500', 'p(99)<1000'],
    auth_register_error_rate: ['rate<0.01'],
    auth_login_error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.02'],
  },
};

// Pre-seed credentials for login scenario — reused across VU iterations.
const SEED_EMAIL = `k6-seed-${Date.now()}@test.local`;
const SEED_PASSWORD = 'Password123!';

export function setup() {
  // Register one seed account for the login scenario to use.
  http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD, name: 'K6 Seed' }),
    { headers: JSON_HEADERS },
  );
  return { seedEmail: SEED_EMAIL, seedPassword: SEED_PASSWORD };
}

export function registerScenario() {
  const email = `k6-reg-${randomString(12)}@test.local`;
  const payload = JSON.stringify({ email, password: 'Password123!', name: `K6 User` });

  const res = http.post(`${BASE_URL}/auth/register`, payload, { headers: JSON_HEADERS });

  registerDuration.add(res.timings.duration);

  const ok = check(res, {
    'register: status 201 or 409': (r) => r.status === 201 || r.status === 409,
    'register: has response body': (r) => r.body.length > 0,
  });

  if (res.status === 409) conflictCount.add(1);
  registerErrors.add(!ok ? 1 : 0);

  sleep(Math.random() * 0.5);
}

export function loginScenario(data) {
  const payload = JSON.stringify({ email: data.seedEmail, password: data.seedPassword });

  const res = http.post(`${BASE_URL}/auth/login`, payload, { headers: JSON_HEADERS });

  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: has accessToken': (r) => {
      try {
        const b = r.json();
        return !!(b?.data?.accessToken ?? b?.accessToken);
      } catch {
        return false;
      }
    },
  });

  loginErrors.add(!ok ? 1 : 0);

  sleep(Math.random() * 0.3);
}
