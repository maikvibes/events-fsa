# Notification Tray + OS-Tray Integration — Design

**Date:** 2026-07-04
**Scope:** Frontend-only. No backend files, migrations, or endpoints are modified.

## Goal

Integrate notification delivery into the running app in three parts:

1. A header notification tray (bell + unread badge + dropdown list) that tracks
   the user's notification history.
2. Reliable OS-tray delivery (Windows / Android / iOS-PWA) from the real backend
   push flow — not just the manual `scripts/send-direct.mjs` test.
3. Auto-enable push (permission + FCM token registration) after login, so users
   are wired to the tray and OS delivery without a manual button.

## Why frontend-only is sufficient

- The backend already sends an FCM `notification` block on every push
  (`apps/notifications/src/notifications.service.ts` lines 54, 176), which is what
  makes OS-tray display automatic. Verified end-to-end via `send-direct.mjs`:
  the message was accepted and rendered in the Windows tray.
- Both endpoints the tray/auto-enable need already exist:
  `GET /notifications/me` and `POST /notifications/register-token`.
- Read/unread state is stored client-side (localStorage) — no schema change.

## Part 1 — Header notification tray

New files under `frontend/src/features/notifications/`:

- `use-notification-tray.ts` — hook wrapping the existing `useMyNotifications`
  query with `refetchInterval: 45s` + `refetchOnWindowFocus`. Manages read-state
  in localStorage key `notif:lastReadAt:<userId>`. Returns
  `{ items, unreadCount, markAllRead }`.
  - `unreadCount` = count of items with `createdAt > lastReadAt`.
  - Opening the tray sets `lastReadAt = now` (marks all read).
- `notification-tray.tsx` — presentational `DropdownMenu` with a `BellIcon`
  ghost button + `Badge` (hidden when `unreadCount === 0`). Lists recent items
  (title, body, relative time, status badge reusing `success`/`destructive`
  variants). Footer link to the full `/notifications` page.

Edit: `frontend/src/components/layout/app-header.tsx` — mount `<NotificationTray />`
before the avatar dropdown.

Edit: `frontend/src/features/push/foreground-listener.tsx` — after showing the
toast, invalidate the `['notifications','mine']` query so the tray updates live.

## Part 2 — Reliable OS-tray delivery

Edit: `frontend/public/firebase-messaging-sw.template.js` — add an explicit
`onBackgroundMessage` handler that calls `showNotification` with an icon
(mirroring `send-direct.mjs`'s `webpush.notification`) and a `notificationclick`
listener that opens the app at `/notifications`. `scripts/generate-sw.mjs`
already substitutes the Firebase config, so no other change is required.

## Part 3 — Auto-enable push on login

Refactor: extract the token-registration core of `usePush().enable()` into a
reusable `ensurePushRegistered()`. Call it once after successful login:

- `Notification.permission === 'granted'` → silently re-register token.
- `=== 'default'` → request permission once, then register.
- `=== 'denied'` → no-op (don't nag).

The manual profile-page button remains as a fallback.

## Verification

- `send-direct.mjs <token>` remains the OS-tray smoke test.
- `npx tsc --noEmit` must pass.
- Unit-check the `unreadCount` logic in the tray hook.
