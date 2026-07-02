# k6 Load Test — Known Issues

Findings from running the k6 suite against the local stack on 2026-06-30.
Each endpoint below was probed directly with k6 to capture its real status code.

## Endpoint status summary

| Endpoint (method)                  | Actual status | Result |
| ---------------------------------- | ------------- | ------ |
| `auth/register` (POST)             | 201           | OK     |
| `auth/login` (POST)                | 201           | OK     |
| `events/me` (GET)                  | 200           | OK     |
| `notifications/register-token` (POST) | 201        | OK     |
| `notifications/send` (POST)        | 201           | OK     |
| `events` create (POST)             | **400**       | FAIL   |
| `events/:id` read (GET)            | 400*          | FAIL*  |
| `events/:id` update (PUT)          | **400**       | FAIL   |
| `events/:id` delete (DELETE)       | **400**       | FAIL   |

\* Read fails only because create fails first, so `eventId` is undefined and the
request becomes `GET /events/undefined`.

## Issue 1 — login check expected 200 (fixed in tests)

`POST /auth/login` returns **201**, not 200 (NestJS defaults `@Post` to 201; the
handler has no `@HttpCode(200)`). The k6 checks asserted `status === 200`, so login
was marked failed 100% even though it works.

Fixed in the tests: `01-auth.test.js` and `04-spike.test.js` now accept `200 or 201`.

## Issue 2 — events create/update/delete return 400 (BACKEND BUG, not fixed)

`POST /events`, `PUT /events/:id`, and `DELETE /events/:id` all return:

```json
{"success":false,"statusCode":400,"message":"Validation failed",
 "errors":[{"field":"title","message":"Invalid input: expected string, received undefined"},
           {"field":"description","message":"Invalid input: expected string, received undefined"},
           {"field":"date","message":"Invalid input: expected date, received Date"}]}
```

The k6 payload is correct (e.g. `{"title":"T","description":"D","date":"2026-07-15T04:00:29.203Z"}`),
so this is not a test problem.

### Root cause

In `apps/api-gateway/src/api-gateway.controller.ts`:

```ts
@Post('events')
@UsePipes(new ZodValidationPipe(CreateEventSchema))   // applies to ALL params
createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: TokenPayload) {
  return this.apiGatewayService.createEvent({ ...dto, userId: user.userId });
}
```

`@UsePipes` runs the pipe against **every** handler parameter, including
`@CurrentUser()`. When `CreateEventSchema.safeParse()` runs against the `user`
object (`{ userId, email }`), `title`/`description` are undefined and the `date`
coercion sees the wrong shape — producing the 400 above.

Endpoints without `@CurrentUser` (`notifications/send`, `register-token`) use the
same `@UsePipes` pattern and work fine, which confirms the diagnosis. `events/me`
(GET, no `@UsePipes`) also works.

### Suggested fix (backend)

Validate the body parameter only, instead of the whole handler. For example:

```ts
@Post('events')
createEvent(
  @Body(new ZodValidationPipe(CreateEventSchema.omit({ userId: true }))) dto,
  @CurrentUser() user: TokenPayload,
) {
  return this.apiGatewayService.createEvent({ ...dto, userId: user.userId });
}
```

Apply the same change to the `PUT` and `DELETE` event routes (omit the
JWT-derived fields from the body schema). Until this lands, `02-events-crud`,
`05-soak`, and the create branch of `04-spike` will fail against the live API.

## Note on running the suite

These scripts define their own scenarios with named `exec` functions. Run them
as-is, e.g. `k6 run k6/01-auth.test.js`. Do NOT pass `--vus/--duration` on the CLI —
that forces k6's default executor, which looks for a `default` export these
scenario-based scripts do not provide, and the run fails with
`function 'default' not found in exports`.
