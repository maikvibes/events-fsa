# Notification Console

A single-page console that drives the events-fsa notification pipeline by hand:
**log in → register this device → send a push → create an event** — and watch the
notification land in the OS tray (this PC or a physical phone).

Replaces the old token-grabber page. Uses the Firebase project already in `.env`
(`test-836e1`). No build step, no new dependencies — one static `index.html`
served by `serve.mjs`, talking to the api-gateway at `/api/v1`.

## Why pushes reach the tray

Pushes flow **PC backend → Google FCM cloud → your device**. The device never
talks to your PC directly, so both just need internet. The service worker
(`firebase-messaging-sw.js`) renders background pushes; foreground pushes (tab
focused) appear in the console's result log.

```text
Browser (PC or phone) ──fetch──> api-gateway :3000 ──Kafka──> notifications-svc
        ▲                                                            │
        │                                        firebase-admin.send─┘
        │                                                  │
        └────────── OS tray ◀── Google FCM ◀───────────────┘
```

## Prerequisites

- The stack running:
  `docker compose -f docker-compose.infra.yml up -d && docker compose up -d`
- api-gateway reachable on `http://localhost:3000`
- For **phone** testing only: an HTTPS tunnel (web push requires a secure
  context). **ngrok** is already installed; `cloudflared` works too.

## Test from this PC (no tunnel)

`http://localhost` is a secure context, so web push works with no tunnel.

1. Serve the page:
   ```bash
   node webpush-tester/serve.mjs
   # → webpush-tester serving on http://localhost:8080
   ```
2. Open **http://localhost:8080** in Chrome/Edge.
3. **Panel 1 — Account:** fill name + email + password (≥ 8 chars) and click
   **Register** (or **Login** if you already have an account). You're now logged
   in; the lower panels unlock.
4. **Panel 2 — Register this device:** click **Enable notifications & register**,
   allow notifications. The FCM token is fetched and auto-registered to your
   account. (Make sure Windows notifications are on for the browser.)
5. **Panel 3 — Send:** adjust title/body, click **Send notification**. A tray
   notification should appear within a few seconds; the log shows the messageId.
6. **Panel 4 — Create event:** click **Create event**. This triggers the Kafka
   fan-out, pushing to every device you've registered for that account.
7. **Panel 5 — Log:** every call's result (and any foreground push) shows here.

## Test from your phone

1. Serve the page: `node webpush-tester/serve.mjs`
2. Expose it over HTTPS in a second terminal: `ngrok http 8080`
   Copy the `https://<something>.ngrok-free.app` URL.
   > First time with ngrok? Run `ngrok config add-authtoken <token>` once
   > (free token from https://dashboard.ngrok.com). Alternative: `cloudflared
   > tunnel --url http://localhost:8080` (no account needed).
3. **The gateway must also be reachable from the phone.** The page calls
   `API_BASE` (`http://localhost:3000/api/v1`), and on the phone `localhost` is
   the *phone*, not your PC. Either:
   - tunnel the gateway too (`ngrok http 3000`) and set `API_BASE` in
     `index.html` to that HTTPS URL, **or**
   - run the gateway somewhere the phone can reach over LAN and point `API_BASE`
     there.
4. Open the ngrok URL in **Chrome on your phone** and follow the same panel
   steps (1 → 2 → 3/4). Notifications appear in the phone's tray.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The console — auth, device registration, send, create-event, log |
| `firebase-messaging-sw.js` | Service worker that renders background pushes |
| `serve.mjs` | Zero-dependency static server on :8080 |
| `send-direct.mjs` | Direct FCM push via `.env` service account — bypasses the backend |

## API contract (for reference)

All gateway responses are wrapped as `{ success, data, timestamp }`; the console
reads `data`. Base path `/api/v1`. CORS is enabled on the gateway.

| Action | Call | Notes |
|--------|------|-------|
| Register | `POST /auth/register` | `{ email, password, name }` → `data.{userId,accessToken}` |
| Login | `POST /auth/login` | `{ email, password }` → `data.{userId,accessToken}` |
| Register device | `POST /notifications/register-token` | `{ userId, token, platform:'web' }` (field is `token`) |
| Send | `POST /notifications/send` | `{ userId, deviceToken, title, body }` (field is `deviceToken`) |
| Create event | `POST /events` | `{ title, description, date }` (future ISO); `userId` from JWT |

> **Broadcast** is intentionally not in the console — the gateway doesn't expose
> a broadcast HTTP route (the `notifications` service has one internally).

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Lower panels stay greyed out | Not logged in — register or log in in panel 1 |
| "permission denied" in panel 2 | Allow notifications for the site in Chrome settings, retry |
| Error mentioning `applicationServerKey` / VAPID | Default VAPID key rejected — needs a console-issued key |
| `messaging/unsupported-browser` | Use Chrome (not a webview); URL must be HTTPS, not plain LAN IP |
| Phone: register/send fails with network error | `API_BASE` points at phone-localhost — tunnel the gateway and repoint it (see phone step 3) |
| Send logs "FCM failed" | Token expired/invalid — re-register the device in panel 2 |
| Nothing pops but send says sent | Phone data saver / battery optimization may delay; check the tray |
| 401 on send/create-event | Token expired — log in again |

## Notes

- The `apiKey`/`appId` in these files are **public** web-client values, safe to
  share. The sensitive service-account key stays in `.env`, used only by the
  backend.
- The session (JWT + userId) lives in memory only — a page reload logs you out.
