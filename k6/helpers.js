import http from 'k6/http';
import { fail } from 'k6';

const RAW_BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

function withApiPrefix(url) {
  const trimmed = url.replace(/\/+$/, '');
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export const BASE_URL = withApiPrefix(RAW_BASE_URL);

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const DEFAULT_PASSWORD = __ENV.TEST_PASSWORD || 'Password123!';

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
