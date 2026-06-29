/**
 * Notifications load test — covers device token registration and notification dispatch.
 *
 * Scenarios:
 *   token_registration  — users registering device tokens on login (common mobile pattern)
 *   send_notification   — admin/system sending push notifications to users
 *
 * This stresses:
 *   - Redis device token cache (24h TTL)
 *   - Postgres notifications_db write throughput
 *   - Kafka async fan-out when event.created triggers notifications
 *   - FCM external API (will fail in test env — we check for graceful error handling)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, authHeaders, createUser, randomString } from './helpers.js';

const tokenRegDuration = new Trend('notif_token_reg_duration', true);
const sendDuration = new Trend('notif_send_duration', true);
const tokenRegErrors = new Rate('notif_token_reg_error_rate');
const sendErrors = new Rate('notif_send_error_rate');
const fcmFailures = new Counter('notif_fcm_failures');

export const options = {
  scenarios: {
    token_registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 300 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      exec: 'tokenRegistrationScenario',
    },
    send_notification: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '1m',
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'sendNotificationScenario',
    },
  },
  thresholds: {
    notif_token_reg_duration: ['p(95)<2000', 'p(99)<4000'],
    notif_send_duration: ['p(95)<5000', 'p(99)<10000'],
    notif_token_reg_error_rate: ['rate<0.01'],
    // send errors are expected (FCM not configured in test env) — track, don't fail
    notif_send_error_rate: ['rate<0.5'],
    http_req_failed: ['rate<0.05'],
  },
};

const PLATFORMS = ['ios', 'android', 'web'];

export function setup() {
  const users = [];
  for (let i = 0; i < 5; i++) {
    users.push(createUser(`notif-${i}`));
  }
  return { users };
}

export function tokenRegistrationScenario(data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  // Simulate a device registering its push token (e.g., on app launch).
  const fakeToken = `device-token-${randomString(32)}`;
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];

  const res = http.post(
    `${BASE_URL}/notifications/register-token`,
    JSON.stringify({ userId: user.userId, token: fakeToken, platform }),
    { headers },
  );

  tokenRegDuration.add(res.timings.duration);

  const ok = check(res, {
    'register token: status 201': (r) => r.status === 201,
    'register token: has response body': (r) => r.body.length > 0,
  });

  tokenRegErrors.add(!ok ? 1 : 0);

  sleep(Math.random() * 1 + 0.5);
}

export function sendNotificationScenario(data) {
  const user = data.users[__VU % data.users.length];
  const headers = authHeaders(user.token);

  // In test env, FCM will fail but the API should still accept and queue the request.
  const fakeDeviceToken = `device-token-${randomString(32)}`;

  const res = http.post(
    `${BASE_URL}/notifications/send`,
    JSON.stringify({
      userId: user.userId,
      deviceToken: fakeDeviceToken,
      title: `Notification ${randomString(6)}`,
      body: `Load test notification body ${randomString(20)}`,
      data: { source: 'k6-load-test', timestamp: String(Date.now()) },
    }),
    { headers },
  );

  sendDuration.add(res.timings.duration);

  // 201 = queued & sent; 5xx = FCM failure or service error
  const accepted = check(res, {
    'send notification: accepted (201 or 202)': (r) => r.status === 201 || r.status === 202,
    'send notification: not 5xx': (r) => r.status < 500,
  });

  if (res.status >= 500) fcmFailures.add(1);
  sendErrors.add(!accepted ? 1 : 0);

  sleep(Math.random() * 2 + 1);
}
