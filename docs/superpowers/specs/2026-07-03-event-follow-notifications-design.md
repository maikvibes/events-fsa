# Event Follow & Notifications — Design

## Purpose

Repurpose the product around a clear split:
- **Mobile app (user-facing):** browse events, follow the ones you care about, get notified about them. No event authoring.
- **Web app (admin-facing):** the only place events, users, and manual announcements are managed.

This spec covers sub-projects 1–4 below in full. Sub-project 5 (web admin) is a plan only — no implementation in this pass.

1. Backend: Follow relationship, notification fanout, reminders
2. Mobile: replace CRUD-tester UI with browse/follow/inbox
3. Seed data
4. CI/CD: add the web frontend to the pipeline, deploy on port 80
5. Web admin: planning only

---

## 1. Backend

### Data model

`apps/events` Prisma schema gains:

```prisma
model Event {
  // ...existing fields unchanged...
  reminderSentAt DateTime?
  follows        EventFollow[]
}

model EventFollow {
  id        String   @id @default(uuid())
  userId    String
  eventId   String
  createdAt DateTime @default(now())
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([userId, eventId])
  @@index([userId])
  @@index([eventId])
}
```

`reminderSentAt` guards the 24h-before reminder against being sent twice.

### Ownership model change

Event creation/update/delete/announce become **admin-only**, gated by the existing `AdminGuard` (email allowlist via `ADMIN_EMAILS`) — same guard already used for `/notifications/broadcast`. Regular users get read-only + follow access. The `userId` field on `Event` becomes "created by admin X" for audit, not an ownership key.

### API surface (api-gateway → events-svc RPC, REST-facing)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/events` | any user | discovery list, all events, replaces implicit owner-only assumption |
| GET | `/events/:id` | any user | unchanged |
| GET | `/events/me` | any user | **repurposed**: now means "events I follow", not "events I created" |
| POST | `/events` | AdminGuard | unchanged shape, now admin-gated |
| PUT | `/events/:id` | AdminGuard | unchanged shape, now admin-gated |
| DELETE | `/events/:id` | AdminGuard | unchanged, now admin-gated |
| POST | `/events/:id/follow` | any user | idempotent (unique constraint) |
| DELETE | `/events/:id/follow` | any user | unfollow |
| POST | `/events/:id/announce` | AdminGuard | `{title, body}`, manual push to followers |
| GET | `/notifications/me` | any user | **new** — lists the caller's `NotificationLog` rows |

### Fanout mechanism

Events-svc already emits `EVENT_CREATED` / `EVENT_UPDATED` / `EVENT_DELETED` Kafka events; notifications-svc only consumes `EVENT_CREATED` today (notifies the creator). Followers live in events-svc's own DB, and services don't reach across each other's databases, so events-svc resolves `followerUserIds: string[]` itself at emit time and includes it directly in the event payload:

```ts
interface EventFollowerNotifyEvent {
  eventId: string;
  title: string;
  body: string;          // pre-formatted message, e.g. "Event X was updated"
  followerUserIds: string[];
}
```

New Kafka topics: `EVENT_UPDATED_FOR_FOLLOWERS`, `EVENT_DELETED_FOR_FOLLOWERS`, `EVENT_ANNOUNCEMENT`, `EVENT_REMINDER_DUE` — all sharing the shape above (emitted alongside the existing raw `EVENT_UPDATED`/`EVENT_DELETED` topics, which stay as-is for any other consumer).

Notifications-svc gets one new method:

```ts
async notifyFollowers(userIds: string[], title: string, body: string, eventId?: string) {
  const tokens = await this.prisma.deviceToken.findMany({ where: { userId: { in: userIds } } });
  return this.sendMulticast({ tokens: tokens.map(t => t.token), title, body });
}
```
...plus one `@EventPattern` listener per new topic, all delegating to `notifyFollowers`. Each send is also logged to `NotificationLog` per recipient (loop, since the multicast call is per-token not per-user) so `/notifications/me` has something to show.

### Reminders (24h before, one-shot)

New `@nestjs/schedule` cron in events-svc, every 15 minutes:
```
find Event where date BETWEEN now()+23h45m AND now()+24h AND reminderSentAt IS NULL
  → resolve followers → emit EVENT_REMINDER_DUE → set reminderSentAt = now()
```

---

## 2. Mobile

Strip the app down to its stated purpose — remove every admin/test-harness affordance, keep only what a follower needs.

- **Events tab** (`EventsScreen`, currently a raw CRUD tester): replaced with a **browse list** — `GET /events`, each row shows title/date/description with a Follow/Unfollow toggle (`POST`/`DELETE /events/:id/follow`). Remove the create/update/delete forms entirely (admin-only now, lives on web).
- **Home tab** (`ProfileScreen`): repurposed to show "My followed events" — reuses the repurposed `GET /events/me`.
- **Notifications tab** (`NotificationsScreen`): remove the manual send-to-user/broadcast admin forms. Keep device-token registration (still needed so the device *receives* pushes). Add a real inbox: `GET /notifications/me`, list of past notifications (title, body, date, related event).
- **Console/Settings tab**: unchanged (base-URL switcher still useful for local/dev/prod testing).
- `src/lib/api.ts`: add `listEvents`, `followEvent`, `unfollowEvent`, `listMyNotifications`; remove `sendToUser`/`broadcast` (admin-only, no longer called from mobile).

Push notification delivery depends on FCM credentials being configured per Expo's guide (https://docs.expo.dev/push-notifications/fcm-credentials/) — will verify/complete this as part of implementation, since `expo-notifications` needs the `google-services.json` / FCM V1 service account wired into the EAS/dev-client config, separately from the backend's own Firebase Admin credentials.

---

## 3. Seed data

A `scripts/seed.ts` (or per-service seed under each Prisma schema) run after migrations, idempotent (safe to re-run):

- 3 users (1 admin — email in `ADMIN_EMAILS` — 2 regular) via auth-svc
- 5–6 events spread across past/near-future/far-future dates via events-svc
- A handful of `EventFollow` rows (regular users following a mix of events) so the mobile app has non-empty lists to show immediately after a fresh deploy/dev bootstrap

### Frontend port

No frontend Dockerfile exists yet — the root `Dockerfile` is NestJS-specific (`nest build ${SERVICE_NAME}`) and can't build the Vite app. New `frontend/Dockerfile`: multi-stage, `npm ci && npm run build` then serve `dist/` via nginx, listening on port 80. Joins `docker-compose.prod.yml` the same way the other GHCR-published services do: image `ghcr.io/.../events-fsa-frontend`, `ports: ["80:80"]`.

---

## 4. CI/CD

- `ci.yml` docker matrix gains `frontend` (currently `[api-gateway, auth, events, events-app, notifications]` — the actual Vite app was never in it, only the unused `events-app` placeholder).
- The `changes` path-filter gains a `frontend/**` bucket so unrelated backend-only pushes don't rebuild it (and vice versa) — actually simplest to just add `frontend/**` to the existing single `app` filter bucket, since `docker`/`test` jobs already gate on that one flag.
- `docker-compose.prod.yml` gains the frontend service on port 80, following the existing service pattern (image tag, healthcheck if applicable).
- `cd.yml` needs no changes — it already deploys unconditionally on every push regardless of what changed.

---

## 5. Web admin (planning only — not implemented this pass)

Functions needed, for a future spec:
- Auth: log in as an admin (reuses existing `/auth/login`, gated by the same `ADMIN_EMAILS` check client-side + server enforces via `AdminGuard` regardless)
- Events: full CRUD (create/edit/delete), see follower count per event
- Announcements: trigger `/events/:id/announce` with custom title/body
- Broadcast: trigger `/notifications/broadcast` (already exists server-side, no admin UI yet)
- Users: list users (needs a new admin-only `GET /users` — doesn't exist yet, would need to be added to auth-svc)

This becomes its own brainstorming/spec pass once sub-projects 1–4 land, since it likely needs its own auth-gating pattern on the frontend (route guard) and a couple of new read endpoints (user listing) not yet designed here.

---

## Testing

- Backend: unit tests for `EventsService.follow/unfollow`, the reminder-due query, and `NotificationsService.notifyFollowers`; e2e for the new REST endpoints including the AdminGuard-gated ones (403 for non-admin).
- Mobile: manual verification against the live dev deployment (no local backend in this environment) — browse, follow, unfollow, and confirm a notification arrives after an admin-triggered announce.
- Seed: idempotency check (running twice doesn't duplicate rows) via the `@@unique` constraints already in place.
