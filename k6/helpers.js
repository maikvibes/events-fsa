import http from 'k6/http';
import { fail } from 'k6';

const RAW_BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

function withApiPrefix(url) {
  const trimmed = url.replace(/\/+$/, '');
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export const BASE_URL = withApiPrefix(RAW_BASE_URL);

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

// The dev stack (docker-compose.dev.yml) hits remote Postgres/Kafka/Redis over
// TLS, which is slower than local containers and can exceed k6's 60s default.
export const REQUEST_TIMEOUT = '90s';

export const DEFAULT_PASSWORD = __ENV.TEST_PASSWORD || 'Password123!';

// Admin account for admin-gated endpoints. Must match an entry in the server's
// ADMIN_EMAILS allowlist. The default here is the project convention (also used
// by .env.example / cd.yml); for local dev, override ADMIN_EMAIL/ADMIN_PASSWORD
// in the gitignored .env.local, which `npm run k6:*` loads (see scripts/run-k6.mjs).
// If the account already exists, createAdminUser logs in, so ADMIN_PASSWORD must
// be its real password.
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@eventfsa.local';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || DEFAULT_PASSWORD;

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

  const data = body?.data ?? body;
  const token = data?.accessToken;
  const userId = data?.userId;

  if (!token || !userId) {
    fail(`createUser(${prefix}): missing token/userId in response: ${res.body}`);
  }

  return { email, password, userId, token };
}

// Registers (or logs into, if a prior run already created it) the fixed
// admin account so admin-gated endpoints (e.g. POST /notifications/broadcast)
// can be exercised. Unlike createUser, the email is fixed, not randomized —
// it must match the server's ADMIN_EMAILS allowlist, which k6 can't extend.
export function createAdminUser() {
  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'K6 Admin' }),
    { headers: JSON_HEADERS },
  );

  let res = registerRes;
  if (registerRes.status === 409) {
    res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      { headers: JSON_HEADERS },
    );
  }

  if (res.status !== 201 && res.status !== 200) {
    fail(`createAdminUser: register/login failed — status ${res.status}, body: ${res.body}`);
  }

  let body;
  try {
    body = res.json();
  } catch {
    fail(`createAdminUser: non-JSON body: ${res.body}`);
  }

  const data = body?.data ?? body;
  const token = data?.accessToken;
  const userId = data?.userId;

  if (!token || !userId) {
    fail(`createAdminUser: missing token/userId in response: ${res.body}`);
  }

  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId, token };
}

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomString(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUM.charAt(Math.floor(Math.random() * ALPHANUM.length));
  }
  return out;
}

export function randomFutureDate(maxDaysAhead = 30) {
  const daysAhead = 1 + Math.floor(Math.random() * Math.max(1, maxDaysAhead));
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return d.toISOString();
}
