# Web Push Phone Notification Tester

Make a real FCM push notification pop up on your **physical Android phone's
Chrome browser** — no emulator, no app, no Android Studio, no Firebase Console.

Uses the Firebase project already in `.env` (`test-836e1`). The web client config
was pulled from the Firebase Management API; the Firebase JS SDK's built-in
default VAPID key handles web push, so nothing extra is needed.

## Why this works

Pushes flow **PC backend → Google FCM cloud → your phone**. The phone never
talks to your PC directly, so the phone-hotspot setup doesn't matter — both just
need internet.

```
Phone Chrome ──(HTTPS tunnel)──> local static server (this folder)
     │  copies FCM token
     ▼
PC: node test-push.mjs <token> ──> api-gateway :3000 ──Kafka──> notifications-svc
                                                                      │
                                              firebase-admin.send ────┘
                                                      │
                                          Google FCM ──> notification pops on phone
```

## Prerequisites

- The stack running: `docker compose -f docker-compose.infra.yml up -d && docker compose up -d`
- api-gateway reachable on `http://localhost:3000`
- A tunnel tool for HTTPS. **ngrok** is already installed on this machine.
  (Web push requires HTTPS; a plain `http://<LAN-ip>` URL will not work.)

## Two ways to test

- **PC browser (simplest)** — `http://localhost` is a secure context, so web
  push works with **no HTTPS tunnel**. See "Test from this PC" below.
- **Phone browser** — needs an HTTPS URL, so add an ngrok/cloudflared tunnel.
  See "Test from your phone" below.

The *send* side can be either the full microservices stack (`test-push.mjs`) or
a direct FCM push that bypasses the backend entirely (`send-direct.mjs`). If
Kafka/Postgres/Redis aren't healthy, use `send-direct.mjs`.

---

## Test from this PC (no tunnel)

### 1. Serve the page

```bash
node webpush-tester/serve.mjs
# → webpush-tester serving on http://localhost:8080
```

### 2. Open it in PC Chrome/Edge

- Go to **http://localhost:8080**
- Click **Enable notifications & get token**
- Allow notifications (and make sure Windows notifications are on for the browser)
- Click **Copy token**

### 3. Send a notification straight to this PC (no backend needed)

```bash
node webpush-tester/send-direct.mjs "<PASTE_THE_TOKEN_HERE>"
# optional custom text:
node webpush-tester/send-direct.mjs "<token>" "Hello" "From my PC"
```

A Windows notification should appear within a few seconds. If the tab is focused,
it also shows in the page's "Foreground messages" area.

---

## Test from your phone

### 1. Serve the page locally

```bash
node webpush-tester/serve.mjs
# → webpush-tester serving on http://localhost:8080
```

### 2. Expose it over HTTPS with ngrok

In a second terminal:

```bash
ngrok http 8080
```

Copy the `https://<something>.ngrok-free.app` forwarding URL ngrok prints.

> First time using ngrok? Run `ngrok config add-authtoken <token>` once (free
> token from https://dashboard.ngrok.com). Alternative: install `cloudflared`
> and run `cloudflared tunnel --url http://localhost:8080` (no account needed).

### 3. Open the URL on your phone

- Open the `https://…ngrok-free.app` URL in **Chrome on your phone**
- Tap **Enable notifications & get token**
- Allow notifications when prompted
- Tap **Copy token** (or long-press the token box and copy)
- Send that token to your PC (paste into a chat to yourself, etc.)

### 4. Fire the test from your PC

```bash
node webpush-tester/test-push.mjs "<PASTE_THE_TOKEN_HERE>"
```

This registers a user, registers your token, sends a **direct** notification,
then **creates an event** (exercising the full fan-out pipeline). You should see
up to two notifications on your phone within a few seconds.

You can also point it at a different host:

```bash
BASE_URL=http://localhost:3000/api/v1 node webpush-tester/test-push.mjs "<token>"
```

> **Backend down?** Skip `test-push.mjs` and push directly instead — same result
> on the phone, no microservices required:
>
> ```bash
> node webpush-tester/send-direct.mjs "<token>"
> ```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Token page — requests permission, fetches the FCM token, copy button |
| `firebase-messaging-sw.js` | Required service worker (background push display) |
| `serve.mjs` | Zero-dependency local static server on :8080 |
| `send-direct.mjs` | Direct FCM push via `.env` service account — no backend needed |
| `test-push.mjs` | End-to-end driver: register → login → register-token → send → event |

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Button error: "permission denied" | Allow notifications for the site in Chrome settings, retry |
| Button error mentioning `applicationServerKey` / VAPID | The default VAPID key was rejected — this is the one case needing a console-issued key |
| No token / `messaging/unsupported-browser` | Use Chrome (not a webview); ensure the URL is HTTPS, not plain LAN IP |
| `test-push.mjs` HTTP 401/500 | Stack not up, or api-gateway can't reach Kafka/Postgres — check `docker compose logs` |
| Notification logged `failed` in DB | Token expired/invalid — re-fetch a fresh token on the phone |
| Nothing pops, but send says success | Phone Chrome data saver / battery optimization may delay; check the notification tray |

## Notes

- The `apiKey`/`appId` in these files are **public** web-client values, safe to
  share. The sensitive service-account key stays in `.env` and is used only by
  the backend.
- No backend code or Firebase project settings are modified by this tester.
