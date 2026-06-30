/**
 * Shared helpers for the k6 load-test suite.
 *
 * Every test file imports from here. Configuration is driven by environment
 * variables so the same scripts run against local, staging, or prod:
 *
 *   k6 run -e BASE_URL=http://localhost:3000 k6/01-auth.test.js
 *
 * Notes on the target API (api-gateway):
 *   - Global prefix is `api/v1` (see apps/api-gateway/src/main.ts), so BASE_URL
 *     must include it. We append it automatically if it's missing.
 *   - All responses are wrapped by TransformInterceptor as
 *     `{ success, data, timestamp }` — so payloads live under `.data`.
 *   - Events expose their id as `data.eventId` (see EventDto), NOT `data.id`.
 */
import http from 'k6/http';
import { fail } from 'k6';

// --- Configuration ---------------------------------------------------------

const RAW_BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Ensure the api/v1 global prefix is present exactly once.
function withApiPrefix(url) {
  const trimmed = url.replace(/\/+$/, '');
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export const BASE_URL = withApiPrefix(RAW_BASE_URL);

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const DEFAULT_PASSWORD = __ENV.TEST_PASSWORD || 'Password123!';

// --- Auth helpers ----------------------------------------------------------

/**
 * Build the headers for an authenticated request.
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function registerToken(token, userId, deviceToken, platform = 'web') {
  return http.post(
    `${BASE_URL}/notifications/register-token`,
    JSON.stringify({ userId, token: deviceToken, platform }),
    { headers: authHeaders(token) },
  );
}

/**
 * Register a brand-new user and return their credentials + JWT.
 *
 * Used in setup() to seed a pool of users shared across VUs. Fails the test
 * loudly if registration doesn't succeed, since every downstream request
 * depends on a valid token.
 *
 * @param {string} prefix  short label to keep emails unique & debuggable
 * @returns {{ email, password, userId, token }}
 */
export function createUser(prefix = 'user') {
  const email = `k6-${prefix}-${randomString(12)}@test.local`;
  const password = DEFAULT_PASSWORD;

  const res = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password, name: `K6 ${prefix}` }),
    { headers: JSON_HEADERS },
  );

  if (res.status !== 201) {
    fail(`createUser(${prefix}): register failed — status ${res.status}, body: ${res.body}`);
  }

  let body;
  try {
    body = res.json();
  } catch {
    fail(`createUser(${prefix}): register returned non-JSON body: ${res.body}`);
  }

  // Responses are wrapped: { success, data: { userId, email, name, accessToken }, timestamp }
  const data = body?.data ?? body;
  const token = data?.accessToken;
  const userId = data?.userId;

  if (!token || !userId) {
    fail(`createUser(${prefix}): missing token/userId in response: ${res.body}`);
  }

  return { email, password, userId, token };
}

// --- Data generators -------------------------------------------------------

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Random alphanumeric string of the given length.
 */
export function randomString(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUM.charAt(Math.floor(Math.random() * ALPHANUM.length));
  }
  return out;
}

/**
 * ISO 8601 datetime guaranteed to be in the future.
 *
 * The CreateEventSchema rejects non-future dates, so we offset by at least
 * one day plus a random spread.
 *
 * @param {number} maxDaysAhead  upper bound of the random offset (days)
 * @returns {string} ISO 8601 string
 */
export function randomFutureDate(maxDaysAhead = 30) {
  const daysAhead = 1 + Math.floor(Math.random() * Math.max(1, maxDaysAhead));
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return d.toISOString();
}
