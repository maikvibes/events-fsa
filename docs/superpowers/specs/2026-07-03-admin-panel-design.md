# Admin Panel — Design Spec

## Goal

Give admins a way to view and manage users, events, and notifications from the
existing frontend, as a new tab alongside Device/Event/Send/Profile.

## Current state (context)

- Admin gating is `ADMIN_EMAILS` allowlist (`apps/api-gateway/src/guards/admin.guard.ts`),
  no `role`/`isAdmin` field anywhere — not in the DB, not in the JWT, not exposed
  to the frontend.
- Existing convention for admin-only actions in the frontend (see
  `frontend/src/features/send/hooks/useSend.ts`): the UI does **not** gate on
  admin status client-side. It always shows the control, attempts the call, and
  on a 403 shows "Admin only — you are not on the ADMIN_EMAILS allowlist." This
  spec follows that same convention rather than introducing an `isAdmin` flag.
- Events already have full CRUD through the gateway: `GET /events`,
  `POST /events` (admin), `PUT /events/:eventId` (admin),
  `DELETE /events/:eventId` (admin). No new event endpoints are needed.
- No endpoint exists to list users. `apps/auth` only has register/login/getProfile.
- No endpoint exists to list notifications across all users.
  `apps/notifications` only has `findByUser` (self).

## Scope

New "Admin" tab in `MainApp.tsx`, containing three read/manage panels:

1. **Users** — list all users, delete a user.
2. **Events** — list all events, delete an event (reuses existing data/endpoint).
3. **Notifications** — list recent notification log entries across all users
   (read-only).

Out of scope (explicitly not building): editing a user, editing an event from
this panel (existing Event tab already covers create; edit UI is a separate
future concern), pagination beyond a fixed recent-N cap, an `isAdmin` flag.

## Backend changes

### `apps/auth`

- `libs/shared/src/auth.contracts.ts`: add `AuthPatterns.LIST_USERS` and
  `AuthPatterns.DELETE_USER` message patterns, plus a `UserSummary` type
  (`{ userId: string; email: string; name: string; createdAt: string }`).
- `apps/auth/src/auth.service.ts`:
  - `findAll(): Promise<UserSummary[]>` — `prisma.user.findMany`, ordered by
    `createdAt desc`, mapped to exclude `password`.
  - `deleteUser(userId: string): Promise<void>` — `prisma.user.delete`. Relies
    on existing `onDelete: Cascade` on `RefreshToken.user` for cleanup. Throw
    `RpcException 404` if not found (Prisma `P2025`).
- `apps/auth/src/auth.controller.ts`: two new `@MessagePattern` handlers wired
  to the above.

### `apps/notifications`

- `libs/shared/src/events-svc.contracts.ts`: add `NotificationsPatterns.FIND_ALL`.
- `apps/notifications/src/notifications.service.ts`:
  - `findAll(limit = 200)` — `prisma.notificationLog.findMany`, ordered by
    `createdAt desc`, `take: limit`. Returns full rows (userId, eventId,
    title, body, status, error, createdAt).
- `apps/notifications/src/notifications.controller.ts`: one new
  `@MessagePattern` handler.

### `apps/api-gateway`

Three new routes, all `@UseGuards(AdminGuard)`, added to
`api-gateway.controller.ts` / `api-gateway.service.ts`:

- `GET /admin/users` → calls auth service `LIST_USERS`.
- `DELETE /admin/users/:userId` → calls auth service `DELETE_USER`.
- `GET /admin/notifications` → calls notifications service `FIND_ALL`.

No Zod body schemas needed (no request body on any of these three).
`:userId` param validated with the existing `ParseUUIDPipe` pattern used
elsewhere in the controller.

## Frontend changes

New feature folder `frontend/src/features/admin/`:

- `api/admin.api.ts` — `listUsers()`, `deleteUser(userId)`,
  `listNotifications()`, following the existing fetch-wrapper pattern in
  `frontend/src/services/http/client.ts`.
- `hooks/useAdmin.ts` — mirrors `useProfile.ts`'s lazy-load-on-tab-open shape:
  `users`, `usersStatus`, `notifications`, `notificationsStatus`, `loading`,
  `onTabOpen()` (loads both lists once per session), `removeUser(userId)`
  (calls delete then refetches users).
- `components/AdminSection.tsx` — three sub-panels in one scroll view (not
  nested tabs, to keep it simple):
  - Users table: email, name, createdAt, delete button with a confirm
    (`window.confirm`, matching the existing `onDeleteEvent` confirm pattern
    in `EventSection.tsx`).
  - Events table: reuses the `events` prop already fetched by `useEvent` in
    `App.tsx` — no new fetch. Delete button reuses existing `onDeleteEvent`.
  - Notifications table (read-only): userId, title, body, status, createdAt.

Wiring:

- `MainApp.tsx`: add `'admin'` to the `Tab` union and `TABS` array, render
  `AdminSection` when active, call `onAdminTabOpen()` on tab click (same
  pattern as `onProfileTabOpen`).
- `App.tsx`: instantiate `useAdmin({ token: auth.token, addLog: log.add })`,
  pass its fields/handlers through to `MainApp`, plus `events` (already
  available) and `onDeleteEvent` (already available) for the Events panel.

## Error handling

- Every panel's fetch/delete goes through the existing `ApiError` +
  `addLog` pattern already used throughout the app (see `useSend.ts` for the
  403 message convention). A non-admin sees "Admin only —..." per panel, not
  a blanket redirect — consistent with how Send already behaves.
- Delete confirms client-side before firing the request (matches existing
  event-delete UX).

## Testing

- No new automated test suite is being introduced in this spec (repo has no
  existing frontend test harness for these feature folders, matching current
  practice — `EventSection`/`SendSection`/`ProfileSection` are untested).
- Manual verification: log in as an `ADMIN_EMAILS` account, hit the three new
  gateway endpoints via the new tab; log in as a non-admin account, confirm
  each panel surfaces "Admin only" instead of data.
