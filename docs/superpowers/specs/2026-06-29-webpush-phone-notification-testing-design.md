# Web Push Phone Notification Testing — Design

**Date:** 2026-06-29
**Status:** Awaiting review (revised — uses existing `.env` project, no console)

## Goal

Test the notification microservice end-to-end by making a real push notification
pop up on a **physical Android phone's Chrome browser** — with no emulator, no
native app, no Android Studio, **and no Firebase Console access**.

The phone receives pushes through Google's FCM cloud, so the phone↔PC network
topology (phone hotspot) is irrelevant. Both only need internet.

## Key Insight (what unblocked this)

FCM only delivers to a token minted for the **same Firebase project** the backend
sends from. We have no console access to that project (`test-836e1`) — only the
service account in `.env`. Two things make web push work anyway:

1. **The web client config is fetchable via the Firebase Management API** using
   the existing service account. A web app ("skibidi") is already registered in
   `test-836e1`; we pulled its full config (apiKey, authDomain,
   messagingSenderId, appId) read-only — no console needed.
2. **The Firebase JS SDK has a built-in default VAPID key.** `getToken()` falls
   back to it when no project-specific key is supplied, so the console-only
   "Web Push certificate" is not required.

Result: everything needed is available from `.env` alone.

### Fetched web config for `test-836e1`

```js
const firebaseConfig = {
  apiKey: "AIzaSyBM1lvq73MR0EH95LaP1MTh1pouUZ9UCo8",
  authDomain: "test-836e1.firebaseapp.com",
  projectId: "test-836e1",
  storageBucket: "test-836e1.firebasestorage.app",
  messagingSenderId: "916952965378",
  appId: "1:916952965378:web:f28bd80ed4471fbf58621b",
  measurementId: "G-9BL3BSZ5T5",
};
```
(These are public client values — safe to place in the test page.)

## Architecture & Flow

```
┌─────────────┐  1. open HTTPS tunnel URL   ┌──────────────────────────┐
│ Phone Chrome│ ──────────────────────────► │ cloudflared tunnel       │
│             │                             │   → local static server  │
│             │ ◄──── 2. FCM web token ──── │   (webpush-tester/)       │
└──────┬──────┘                             └──────────────────────────┘
       │ 3. copy token (shown on page)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PC: curl → api-gateway :3000                                     │
│   a) POST /auth/register + /auth/login   → JWT + userId          │
│   b) POST /notifications/register-token  (platform=web)          │
│   c) POST /events  OR  /notifications/send                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Kafka RPC → notifications-svc
                               ▼
                   firebase-admin.send(token)  ← .env service account
                               │
                               ▼
                   Google FCM cloud ──► 4. notification pops on phone
```

## Components

### 1. Static web test page (new — `webpush-tester/`)
- **`index.html`** — loads Firebase Web SDK (gstatic CDN), inits with the config
  above, requests notification permission, calls `getToken()` (default VAPID),
  shows the token with a copy button, logs foreground messages via `onMessage`.
- **`firebase-messaging-sw.js`** — required service worker; inits messaging so
  Chrome auto-displays background pushes when the tab isn't focused.

### 2. HTTPS exposure — `cloudflared` quick tunnel
Web push service workers require a secure context (HTTPS). We serve
`webpush-tester/` from a local static server and expose it via
`cloudflared tunnel --url http://localhost:8080`, which returns an instant
`https://<random>.trycloudflare.com` URL — **no account, no git push, no
console.** (Fallback: ngrok, or any HTTPS static host.)

### 3. Backend (assessment — no code changes)
`notifications.service.ts` already sends a cross-platform `notification` payload;
FCM auto-displays it for web tokens, and the `android`/`apns` blocks are ignored.
**No backend changes required.**

### 4. Environment (`.env`)
**No change.** The existing `test-836e1` service account is both the sender and
the project the web client registers against — they already match.

## Dependencies to confirm at implementation time
- `cloudflared` (or ngrok) available on the PC — install if missing.
- A static file server (`npx serve`, Python `http.server`, or a tiny node script).
- The stack running (`docker compose up`) with api-gateway reachable on :3000.

## Implementation Steps (I do these)
1. Scaffold `webpush-tester/index.html` + `firebase-messaging-sw.js` with the
   fetched config.
2. Add a tiny static-server + tunnel helper (script or documented one-liner).
3. Write `webpush-tester/README.md` with the full run + test procedure.
4. Provide the end-to-end curl script: register → login → register-token
   (`platform=web`) → create event / send notification.

## Testing Procedure (end-to-end)
1. Start stack; start static server; start `cloudflared` → get HTTPS URL.
2. Open URL in **phone Chrome** → allow notifications → copy the token.
3. Run the curl flow from the PC (register/login → register-token → create event
   or send).
4. **Expected:** notification pops on the phone within seconds.
5. **Negative check:** invalid token → backend logs `failed` in
   `notificationLog` and emits `notification.failed` on Kafka.

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| SDK version requires explicit VAPID key | Test default first; if it fails, this is the only thing that would need a console-issued key |
| Web `apiKey` is API-restricted and blocks FCM/Installations | Test project key is likely unrestricted; surfaces immediately at token fetch |
| `cloudflared` not installed | Install, or fall back to ngrok |
| `register-token` requires JWT | Test script registers/logs in a user first |

## Out of Scope
- Native Android app / APK, iOS / APNs
- Custom web notification styling (icons, actions)
- Any change to the Firebase project or backend code
```
