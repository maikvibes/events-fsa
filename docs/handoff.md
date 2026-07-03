# Handoff — 2026-07-03

## Summary

This session covered two small completed fixes on the frontend and two implementation
plans for larger initiatives. No backend/infra code from the plans has been written yet —
both are planning-only deliverables, ready to execute whenever picked back up.

## Completed in this session

- **Delete-user loading indicator** — `frontend/src/features/admin/components/users-panel.tsx`
  now shows a spinner on the row being deleted (`deleteUser.isPending && deleteUser.variables === u.userId`),
  disabling the trash button while the request is in flight.
- **Fixed a MenuGroupContext crash** — `frontend/src/components/layout/app-header.tsx` had
  `DropdownMenuLabel` as a direct child of `DropdownMenuContent`. Base UI's `Menu.GroupLabel`
  requires a `Menu.Group` ancestor, so it threw `MenuGroupContext is missing` at runtime. Fixed
  by wrapping the label in a `DropdownMenuGroup`.

## Plan 1 — Admin Users RBAC + Pagination

**Doc:** `docs/superpowers/plans/2026-07-03-admin-users-rbac-and-pagination.md` (14 tasks)

Started as "add pagination/search/filtering to the admin users list (~10k users)" and grew in
scope once we found there was no DB-backed role/status field — admin access today is a pure
`ADMIN_EMAILS` env allowlist. After walking through the tradeoffs together, the agreed scope is:

- Full switch to DB-backed roles (`Role` enum on `User`, JWT claim, rewritten `AdminGuard`),
  replacing the env allowlist. Status field explicitly **not** added (deferred).
- One-time seed script reads `ADMIN_EMAILS` to promote existing admins into the new `role`
  column, avoiding a lockout on cutover.
- Hard cutover, paired with shortening the JWT lifetime from 7d to **1h** (no refresh-token
  flow exists yet — accepted as a known follow-up, users just re-login hourly for now).
- Users list: 20/page (10/20/50/100 selectable), clickable column sort, filters on join date
  and role.

Tasks 1–9 are the RBAC cutover; Tasks 10–14 are the actual pagination/search/filter/sort UI and
API work. Not started — no code written for this plan.

## Plan 2 — Gateway ↔ Auth/Events gRPC Migration

**Doc:** `docs/superpowers/plans/2026-07-03-gateway-grpc-migration.md` (14 tasks)

Replaces the synchronous `ClientKafka.send()` / `@MessagePattern` request-response calls
between the API gateway and the `auth`/`events` microservices with gRPC. Gateway↔notifications
and every fire-and-forget Kafka path (events→notifications fan-out, notifications' own
sent/failed events) stay on Kafka, untouched.

Notable finding from research, baked into the plan: NestJS's built-in gRPC exception handling
only recognizes an `RpcException` payload's `.code`/`.status` field, not the `.statusCode`
field this codebase uses everywhere today. Left as-is, every business error (login failure,
404s, etc.) would silently degrade to a generic HTTP 500 once served over gRPC. The plan fixes
this on both ends — service-side (`statusCode` → grpc `status` enum) and gateway-side (a new
`ServiceError` → HTTP status mapping in `AllExceptionsFilter`) — with a live curl smoke test in
the final task exercising a 409 and a 401/404 to confirm parity with current behavior.

Not started — no code written for this plan.

## How to pick either plan back up

Both docs follow the `superpowers:writing-plans` format — self-contained, bite-sized,
checkbox tasks with exact file paths and complete code, no placeholders. To execute either:

- **Subagent-driven** (recommended for larger plans): dispatch a fresh subagent per task with
  `superpowers:subagent-driven-development`, review between tasks.
- **Inline execution**: work through tasks in-session with `superpowers:executing-plans`,
  batching with checkpoints.

## Known loose ends not part of either plan

- `libs/shared/src/kafka.contracts.ts` has an uncommitted local change on disk that removes
  `eventId?: string` from `NotificationBroadcastEvent` — this reverts a real feature added in
  PR #13 (broadcast-with-eventId) and is still referenced by `ApiGatewayService.broadcast()`.
  Left uncommitted/unpushed on purpose; needs a decision before it's either committed or
  discarded.
- `docs/superpowers/specs/2026-07-03-orchestrated-fcm-load-test-design.md` exists untracked in
  the working tree, unrelated to this session's work — left as-is.
