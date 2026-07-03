# Gateway ↔ Auth/Events gRPC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synchronous request/response calls between the API gateway and the `auth` and `events` microservices (currently `ClientKafka.send()` / `@MessagePattern`) with gRPC, while leaving every fire-and-forget Kafka path (events→notifications fan-out, notifications' own sent/failed events, and all gateway↔notifications traffic) untouched.

**Architecture:** `auth` and `events` each stop listening on Kafka entirely and instead boot as gRPC microservices (`Transport.GRPC`) using hand-written `.proto` files checked into `libs/shared/src/proto/`. The gateway gets two new `ClientGrpc` connections (one per service) alongside its existing Kafka connection to `notifications`. Business logic in `AuthService`/`EventsService` is untouched — only the controller layer (the transport adapter) and the two places that throw `RpcException` for real errors change. gRPC's `getService()` is synchronous (no connect/subscribe dance like Kafka), which lets `ApiGatewayService.onModuleInit` shrink to only the notifications Kafka wiring, and lets `JwtAuthGuard` grab its client in its constructor with no lifecycle hook at all.

**Tech Stack:** `@nestjs/microservices` (already `^11.1.27`), new deps `@grpc/grpc-js` and `@grpc/proto-loader` (both already present transitively in `package-lock.json` via `firebase-admin`→`google-gax`, being promoted to direct deps), no codegen tool (no `ts-proto`/`protoc`) — proto files are loaded dynamically at runtime, and TS message/client-interface types are hand-written in `libs/shared`, matching this codebase's existing convention of hand-written contracts (see `auth.contracts.ts`/`events-svc.contracts.ts`) rather than generated types.

## Global Constraints

- Only gateway↔auth and gateway↔events synchronous request/response calls migrate to gRPC. Gateway↔notifications (`SEND_TO_USER`, `FIND_BY_USER`, `FIND_ALL`, `notifications.register-token`) and every event-driven Kafka path (`events` producer → `notifications` `@EventPattern`s, `notifications`' own `NOTIFICATION_SENT`/`FAILED` emits, the admin `NOTIFICATION_BROADCAST` emit) stay on Kafka, byte-for-byte unchanged.
- Hard cutover per service, no dual-transport transition period: once migrated, `auth` and `events` no longer bind to Kafka at all.
- No TLS between services (`credentials.createInsecure()` client-side, plaintext server-side) — matches the current unencrypted internal Kafka broker setup on the `backend` Docker network.
- `AuthService` and `EventsService` business logic (all Prisma calls, caching, JWT signing, Kafka producer emits to `notifications`) must not change, except the two `RpcException` payloads that must switch from `{ statusCode, message }` to `{ code, message }` using `@grpc/grpc-js`'s `status` enum — this is required for the error to carry a meaningful gRPC status code instead of degrading to `UNKNOWN`.
- Every field that is a `Date` in an existing domain type (`UserSummary.createdAt`, `EventDto.date/createdAt/updatedAt`) must be serialized to an ISO string at the controller boundary before it goes on the wire (proto3 has no native date type), and deserialized back to `Date` at the gateway boundary, so no downstream consumer (HTTP controller, frontend) sees a contract change.
- `AuthPatterns` and `EventsPatterns` (the Kafka pattern-name constants) are deleted, not just left unused — confirmed via repo-wide grep that they are referenced only in the four files this plan rewrites.

## File Structure

**New:**
- `libs/shared/src/proto/auth.proto` — gRPC service/message definitions for auth
- `libs/shared/src/proto/events.proto` — gRPC service/message definitions for events
- `libs/shared/src/grpc-config.ts` — `protoPath()` helper, `grpcClientConfig()` helper, shared `Empty` type
- `apps/api-gateway/src/api-gateway.service.spec.ts` — new unit tests for the Date↔string wire mapping
- `apps/api-gateway/src/guards/jwt-auth.guard.spec.ts` — new unit test for the gRPC-backed guard
- `apps/api-gateway/src/filters/all-exceptions.filter.spec.ts` — new unit test for the grpc→HTTP status mapping

**Modified:**
- `libs/shared/src/auth.contracts.ts` — add gRPC wire types, remove `AuthPatterns`
- `libs/shared/src/events-svc.contracts.ts` — add gRPC wire types, remove `EventsPatterns` (keep `NotificationsPatterns`/`EventDto`)
- `libs/shared/src/index.ts` — export the new `grpc-config` module
- `apps/auth/src/auth.service.ts` — fix `RpcException` payloads (`statusCode`→`code`)
- `apps/auth/src/auth.controller.ts` — `@MessagePattern` → `@GrpcMethod`, Date→string mapping
- `apps/auth/src/auth.controller.spec.ts` — rewrite for the new handler shapes
- `apps/auth/src/main.ts` — bootstrap as a gRPC microservice
- `apps/events/src/events.service.ts` — fix the one `RpcException` payload
- `apps/events/src/events.controller.ts` — `@MessagePattern` → `@GrpcMethod`, Date→string mapping
- `apps/events/src/events.controller.spec.ts` — rewrite for the new handler shapes
- `apps/events/src/main.ts` — bootstrap as a gRPC microservice
- `apps/api-gateway/src/api-gateway.module.ts` — register gRPC clients for auth/events, keep Kafka client for notifications
- `apps/api-gateway/src/api-gateway.service.ts` — call gRPC clients instead of `ClientKafka.send()`, unwrap/convert wire types back to domain types
- `apps/api-gateway/src/guards/jwt-auth.guard.ts` — call the auth gRPC client
- `apps/api-gateway/src/filters/all-exceptions.filter.ts` — map grpc-js `ServiceError` → HTTP status
- `package.json` — add `@grpc/grpc-js`, `@grpc/proto-loader`
- `Dockerfile` — copy `libs/shared/src/proto` into the runner stage
- `docker-compose.dev.yml` / `docker-compose.prod.yml` — gRPC ports/URLs for auth/events, drop Kafka wiring from `auth`
- `.env.example` — document the new gRPC env vars

---

### Task 1: Shared gRPC plumbing — proto files, config helper, dependencies

**Files:**
- Create: `libs/shared/src/proto/auth.proto`
- Create: `libs/shared/src/proto/events.proto`
- Create: `libs/shared/src/grpc-config.ts`
- Modify: `libs/shared/src/index.ts`
- Modify: `package.json:52-75` (dependencies block)

**Interfaces:**
- Produces: `protoPath(fileName: string): string`, `grpcClientConfig(name: string, packageName: string, protoFile: string, url: string): ClientProviderOptions`, `Empty` (empty interface, the shared gRPC "no content" message type) — all consumed by every later task.

- [ ] **Step 1: Add the gRPC dependencies**

Edit `package.json`, inside `"dependencies"` (alphabetical, matching existing ordering):

```json
    "@grpc/grpc-js": "^1.14.4",
    "@grpc/proto-loader": "^0.8.1",
```

Place them right after `"@eslint/js"`... no — these go in `dependencies`, not `devDependencies`. Insert alphabetically among the existing `dependencies` keys, i.e. immediately before `"@nestjs/common"`:

```json
  "dependencies": {
    "@grpc/grpc-js": "^1.14.4",
    "@grpc/proto-loader": "^0.8.1",
    "@nestjs/common": "^11.0.1",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `@grpc/grpc-js` and `@grpc/proto-loader` move from transitive (nested under `firebase-admin`) to top-level entries in `package-lock.json`; no version conflicts (both are already resolved at `1.14.4`/`0.8.1` transitively).

- [ ] **Step 3: Write `auth.proto`**

```proto
syntax = "proto3";

package auth;

service AuthService {
  rpc Register (RegisterRequest) returns (AuthResponse);
  rpc Login (LoginRequest) returns (AuthResponse);
  rpc ValidateToken (ValidateTokenRequest) returns (TokenPayload);
  rpc GetProfile (GetProfileRequest) returns (ProfileResponse);
  rpc ListUsers (Empty) returns (UserList);
  rpc DeleteUser (DeleteUserRequest) returns (Empty);
}

message Empty {}

message RegisterRequest {
  string email = 1;
  string password = 2;
  string name = 3;
}

message LoginRequest {
  string email = 1;
  string password = 2;
}

message AuthResponse {
  string userId = 1;
  string email = 2;
  string name = 3;
  string accessToken = 4;
}

message ValidateTokenRequest {
  string token = 1;
}

message TokenPayload {
  string userId = 1;
  string email = 2;
  int32 iat = 3;
  int32 exp = 4;
}

message GetProfileRequest {
  string userId = 1;
}

message ProfileResponse {
  string userId = 1;
  string email = 2;
  string name = 3;
}

message UserSummary {
  string userId = 1;
  string email = 2;
  string name = 3;
  string createdAt = 4;
}

message UserList {
  repeated UserSummary users = 1;
}

message DeleteUserRequest {
  string userId = 1;
}
```

- [ ] **Step 4: Write `events.proto`**

```proto
syntax = "proto3";

package events;

service EventsService {
  rpc Create (CreateEventRequest) returns (EventDto);
  rpc FindAll (FindAllRequest) returns (EventList);
  rpc FindFollowedByUser (FindEventsByUserRequest) returns (EventList);
  rpc FindOne (FindEventRequest) returns (EventDto);
  rpc Update (UpdateEventRequest) returns (EventDto);
  rpc Delete (DeleteEventRequest) returns (Empty);
  rpc Follow (FollowEventRequest) returns (Empty);
  rpc Unfollow (FollowEventRequest) returns (Empty);
  rpc Announce (AnnounceEventRequest) returns (AnnounceResponse);
}

message Empty {}

message CreateEventRequest {
  string userId = 1;
  string title = 2;
  string description = 3;
  string date = 4;
}

message FindAllRequest {
  optional string callerUserId = 1;
}

message FindEventsByUserRequest {
  string userId = 1;
}

message FindEventRequest {
  string eventId = 1;
}

message UpdateEventRequest {
  string eventId = 1;
  string userId = 2;
  optional string title = 3;
  optional string description = 4;
  optional string date = 5;
}

message DeleteEventRequest {
  string eventId = 1;
  string userId = 2;
}

message FollowEventRequest {
  string eventId = 1;
  string userId = 2;
}

message AnnounceEventRequest {
  string eventId = 1;
  string title = 2;
  string body = 3;
}

message AnnounceResponse {
  int32 notified = 1;
}

message EventDto {
  string eventId = 1;
  string userId = 2;
  string title = 3;
  string description = 4;
  string date = 5;
  string createdAt = 6;
  string updatedAt = 7;
  optional bool isFollowing = 8;
}

message EventList {
  repeated EventDto events = 1;
}
```

- [ ] **Step 5: Write `libs/shared/src/grpc-config.ts`**

```ts
import { join } from 'path';
import { ClientProviderOptions, Transport } from '@nestjs/microservices';

// Resolves the same way in dev (cwd = repo root under `nest start`) and in the
// Docker runner stage, which explicitly copies this directory alongside dist
// (see Dockerfile) since @grpc/proto-loader needs a real file on disk.
export const protoPath = (fileName: string): string =>
  join(process.cwd(), 'libs/shared/src/proto', fileName);

export const grpcClientConfig = (
  name: string,
  packageName: string,
  protoFile: string,
  url: string,
): ClientProviderOptions => ({
  name,
  transport: Transport.GRPC,
  options: {
    package: packageName,
    protoPath: protoPath(protoFile),
    url,
  },
});

// Shared "no content" message type for gRPC methods that take or return
// nothing meaningful (mirrors `message Empty {}` in both .proto files).
export interface Empty {
  [key: string]: never;
}
```

Note: `Empty` is typed as `{ [key: string]: never }` rather than a bare `{}` so that TypeScript still rejects accidentally passing real fields, while a literal `{}` remains assignable to it.

- [ ] **Step 6: Export it**

Edit `libs/shared/src/index.ts`:

```ts
export * from './shared.module';
export * from './shared.service';
export * from './kafka.contracts';
export * from './kafka-config';
export * from './grpc-config';
export * from './firebase.contracts';
export * from './redis.contracts';
export * from './schemas';

// Re-export auth contracts (non-DTO — response shapes and token payload)
export * from './auth.contracts';
// Re-export events-svc contracts (patterns, EventDto response shape)
export * from './events-svc.contracts';
```

(Only the new `export * from './grpc-config';` line is added.)

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
Expected: no new errors (this task only adds new files/exports, nothing consumes them yet).

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/proto libs/shared/src/grpc-config.ts libs/shared/src/index.ts package.json package-lock.json
git commit -m "feat(shared): add gRPC proto files and client config helper"
```

---

### Task 2: Auth gRPC contracts

**Files:**
- Modify: `libs/shared/src/auth.contracts.ts` (full rewrite)

**Interfaces:**
- Consumes: `Empty` from `./grpc-config` (Task 1).
- Produces: `AUTH_GRPC_PACKAGE`, `AUTH_PROTO_FILE`, `RegisterRequest`, `LoginRequest`, `ValidateTokenRequest`, `GetProfileRequest`, `DeleteUserRequest`, `UserSummaryWire`, `UserListWire`, `AuthServiceClient` — consumed by the gateway (Task 10/11), the auth controller (Task 5), and the auth guard (Task 11). `AuthResponse`, `ProfileResponse`, `TokenPayload` are kept as-is (no `Date` fields, reused unchanged as gRPC response types). `AuthPatterns` is deleted.

- [ ] **Step 1: Rewrite the file**

```ts
import { Observable } from 'rxjs';
import { Empty } from './grpc-config';

export const AUTH_GRPC_PACKAGE = 'auth';
export const AUTH_PROTO_FILE = 'auth.proto';

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
}

export interface ProfileResponse {
  userId: string;
  email: string;
  name: string;
}

export interface UserSummary {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// --- gRPC wire types (auth.proto) ---

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ValidateTokenRequest {
  token: string;
}

export interface GetProfileRequest {
  userId: string;
}

export interface DeleteUserRequest {
  userId: string;
}

// createdAt travels as an ISO string over the wire (proto3 has no Date type);
// the gateway converts it back to a real Date to keep `UserSummary` accurate.
export interface UserSummaryWire {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface UserListWire {
  users: UserSummaryWire[];
}

export interface AuthServiceClient {
  register(data: RegisterRequest): Observable<AuthResponse>;
  login(data: LoginRequest): Observable<AuthResponse>;
  validateToken(data: ValidateTokenRequest): Observable<TokenPayload>;
  getProfile(data: GetProfileRequest): Observable<ProfileResponse>;
  listUsers(data: Empty): Observable<UserListWire>;
  deleteUser(data: DeleteUserRequest): Observable<Empty>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
Expected: errors in `apps/api-gateway/src/api-gateway.service.ts`, `apps/api-gateway/src/guards/jwt-auth.guard.ts`, and `apps/auth/src/auth.controller.ts` (all still importing/using `AuthPatterns`, which no longer exists). This is expected — those are fixed in Tasks 5, 10, and 11.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/auth.contracts.ts
git commit -m "feat(shared): add gRPC wire types for auth, drop AuthPatterns"
```

---

### Task 3: Events gRPC contracts

**Files:**
- Modify: `libs/shared/src/events-svc.contracts.ts` (full rewrite)

**Interfaces:**
- Consumes: `Empty` from `./grpc-config` (Task 1).
- Produces: `EVENTS_GRPC_PACKAGE`, `EVENTS_PROTO_FILE`, `CreateEventRequest`, `FindAllRequest`, `FindEventsByUserRequest`, `FindEventRequest`, `UpdateEventRequest`, `DeleteEventRequest`, `FollowEventRequest`, `AnnounceEventRequest`, `AnnounceResponseWire`, `EventDtoWire`, `EventListWire`, `EventsServiceClient` — consumed by the gateway (Task 10) and the events controller (Task 8). `NotificationsPatterns` and `EventDto` are kept unchanged (still used for the untouched notifications Kafka path and by `EventsService` internally). `EventsPatterns` is deleted.

- [ ] **Step 1: Rewrite the file**

```ts
import { Observable } from 'rxjs';
import { Empty } from './grpc-config';

export const NotificationsPatterns = {
  SEND: 'notifications.send',
  SEND_TO_USER: 'notifications.send-to-user',
  MULTICAST: 'notifications.multicast',
  BROADCAST: 'notifications.broadcast',
  FIND_BY_USER: 'notifications.find-by-user',
  FIND_ALL: 'notifications.find-all',
} as const;

export interface EventDto {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  // Only populated when the query was made on behalf of an authenticated
  // caller (browse/follow list) — omitted for admin-facing raw reads.
  isFollowing?: boolean;
}

// --- gRPC wire types (events.proto) ---

export const EVENTS_GRPC_PACKAGE = 'events';
export const EVENTS_PROTO_FILE = 'events.proto';

export interface CreateEventRequest {
  userId: string;
  title: string;
  description: string;
  date: string;
}

export interface FindAllRequest {
  callerUserId?: string;
}

export interface FindEventsByUserRequest {
  userId: string;
}

export interface FindEventRequest {
  eventId: string;
}

export interface UpdateEventRequest {
  eventId: string;
  userId: string;
  title?: string;
  description?: string;
  date?: string;
}

export interface DeleteEventRequest {
  eventId: string;
  userId: string;
}

export interface FollowEventRequest {
  eventId: string;
  userId: string;
}

export interface AnnounceEventRequest {
  eventId: string;
  title: string;
  body: string;
}

export interface AnnounceResponseWire {
  notified: number;
}

// date/createdAt/updatedAt travel as ISO strings over the wire; the gateway
// converts them back to real Dates to keep `EventDto` accurate.
export interface EventDtoWire {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  isFollowing?: boolean;
}

export interface EventListWire {
  events: EventDtoWire[];
}

export interface EventsServiceClient {
  create(data: CreateEventRequest): Observable<EventDtoWire>;
  findAll(data: FindAllRequest): Observable<EventListWire>;
  findFollowedByUser(data: FindEventsByUserRequest): Observable<EventListWire>;
  findOne(data: FindEventRequest): Observable<EventDtoWire>;
  update(data: UpdateEventRequest): Observable<EventDtoWire>;
  delete(data: DeleteEventRequest): Observable<Empty>;
  follow(data: FollowEventRequest): Observable<Empty>;
  unfollow(data: FollowEventRequest): Observable<Empty>;
  announce(data: AnnounceEventRequest): Observable<AnnounceResponseWire>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
Expected: additional errors in `apps/events/src/events.controller.ts` and `apps/api-gateway/src/api-gateway.service.ts` (still using `EventsPatterns`). Expected — fixed in Tasks 8 and 10.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/events-svc.contracts.ts
git commit -m "feat(shared): add gRPC wire types for events, drop EventsPatterns"
```

---

### Task 4: Auth service — fix RpcException status codes for gRPC

**Files:**
- Modify: `apps/auth/src/auth.service.ts:1-4,34-38,56-60,68-69,85-90,101-106`
- Test: `apps/auth/src/auth.service.spec.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes — `AuthService`'s public methods (`register`, `login`, `getProfile`, `findAll`, `deleteUser`, `validateToken`) keep the exact same parameter/return types. Only the payload shape of thrown `RpcException`s changes from `{ statusCode, message }` to `{ code, message }`.

Why this is necessary: NestJS's built-in `GrpcExceptionFilter` (`@nestjs/microservices/exceptions/grpc-exception-filter.js`) only promotes an `RpcException`'s payload to a real gRPC status code if the payload has a numeric `.code` (or `.status`) field — `statusCode` is not recognized, so every one of these throws would silently degrade to generic `UNKNOWN` (2) once auth is served over gRPC, which the gateway would then have no way to map back to the correct HTTP status (401/404/409).

- [ ] **Step 1: Write the failing test**

```ts
// apps/auth/src/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-secret' },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('register throws ALREADY_EXISTS when the email is taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
    await expect(
      service.register({ email: 'a@b.com', password: 'password1', name: 'A' }),
    ).rejects.toMatchObject({
      error: { code: status.ALREADY_EXISTS, message: 'Email already in use' },
    });
  });

  it('login throws UNAUTHENTICATED on bad credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toMatchObject({
      error: { code: status.UNAUTHENTICATED, message: 'Invalid credentials' },
    });
  });

  it('getProfile throws NOT_FOUND for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('missing-id')).rejects.toMatchObject({
      error: { code: status.NOT_FOUND, message: 'User not found' },
    });
  });

  it('deleteUser throws NOT_FOUND when the delete fails', async () => {
    prisma.user.delete.mockRejectedValue(new Error('record not found'));
    await expect(service.deleteUser('missing-id')).rejects.toMatchObject({
      error: { code: status.NOT_FOUND, message: 'User not found' },
    });
  });

  it('validateToken throws UNAUTHENTICATED for a garbage token', () => {
    expect(() => service.validateToken({ token: 'not-a-jwt' })).toThrow(
      RpcException,
    );
    try {
      service.validateToken({ token: 'not-a-jwt' });
      fail('expected throw');
    } catch (e) {
      expect((e as RpcException).getError()).toMatchObject({
        code: status.UNAUTHENTICATED,
        message: 'Invalid or expired token',
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: FAIL — actual thrown payloads still have `statusCode`, not `code`.

- [ ] **Step 3: Fix the five throw sites**

Edit `apps/auth/src/auth.service.ts`. Add the import:

```ts
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
```

Change each throw:

```ts
    if (existing)
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Email already in use',
      });
```

```ts
    if (!user || !this.verifyPassword(dto.password, user.password)) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid credentials',
      });
    }
```

```ts
    if (!user)
      throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
```

```ts
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch {
      throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
    }
```

```ts
    } catch {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid or expired token',
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/auth/src/auth.service.ts apps/auth/src/auth.service.spec.ts
git commit -m "fix(auth): use grpc status codes in RpcException payloads"
```

---

### Task 5: Auth controller — migrate to `@GrpcMethod`

**Files:**
- Modify: `apps/auth/src/auth.controller.ts` (full rewrite)
- Modify: `apps/auth/src/auth.controller.spec.ts` (full rewrite)

**Interfaces:**
- Consumes: `AuthServiceClient`'s request/response shapes from `libs/shared/src/auth.contracts.ts` (Task 2) — `RegisterRequest`, `LoginRequest`, `ValidateTokenRequest`, `GetProfileRequest`, `DeleteUserRequest`, `UserListWire`. Consumes `AuthService` methods unchanged (Task 4).
- Produces: nothing new for other tasks — this is a leaf adapter.

Note: `@GrpcMethod` handlers receive the plain request message as their first argument directly (no `@Payload()` decorator, unlike `@MessagePattern`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/auth/src/auth.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    validateToken: jest.fn(),
    getProfile: jest.fn(),
    findAll: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listUsers wraps the array in { users } and stringifies createdAt', async () => {
    authService.findAll.mockResolvedValue([
      { userId: '1', email: 'a@b.com', name: 'A', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const result = await controller.listUsers();
    expect(result).toEqual({
      users: [
        {
          userId: '1',
          email: 'a@b.com',
          name: 'A',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('deleteUser delegates and returns an empty message', async () => {
    authService.deleteUser.mockResolvedValue(undefined);
    const result = await controller.deleteUser({ userId: '1' });
    expect(authService.deleteUser).toHaveBeenCalledWith('1');
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/auth/src/auth.controller.spec.ts`
Expected: FAIL — `AuthController` doesn't export `listUsers`/`deleteUser` in this shape yet (still Kafka-based).

- [ ] **Step 3: Rewrite the controller**

```ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type {
  RegisterRequest,
  LoginRequest,
  ValidateTokenRequest,
  GetProfileRequest,
  DeleteUserRequest,
  UserListWire,
  AuthResponse,
  ProfileResponse,
  TokenPayload,
} from '@app/shared';
import { Empty } from '@app/shared';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Register')
  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.authService.register({
      email: data.email,
      password: data.password,
      name: data.name,
    });
  }

  @GrpcMethod('AuthService', 'Login')
  login(data: LoginRequest): Promise<AuthResponse> {
    return this.authService.login({ email: data.email, password: data.password });
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  validateToken(data: ValidateTokenRequest): TokenPayload {
    return this.authService.validateToken({ token: data.token });
  }

  @GrpcMethod('AuthService', 'GetProfile')
  getProfile(data: GetProfileRequest): Promise<ProfileResponse> {
    return this.authService.getProfile(data.userId);
  }

  @GrpcMethod('AuthService', 'ListUsers')
  async listUsers(): Promise<UserListWire> {
    const users = await this.authService.findAll();
    return {
      users: users.map((u) => ({
        userId: u.userId,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  @GrpcMethod('AuthService', 'DeleteUser')
  async deleteUser(data: DeleteUserRequest): Promise<Empty> {
    await this.authService.deleteUser(data.userId);
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/auth/src/auth.controller.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/auth/src/auth.controller.ts apps/auth/src/auth.controller.spec.ts
git commit -m "feat(auth): migrate controller from Kafka MessagePattern to GrpcMethod"
```

---

### Task 6: Auth bootstrap — switch to gRPC transport

**Files:**
- Modify: `apps/auth/src/main.ts` (full rewrite)

**Interfaces:**
- Consumes: `protoPath`, `AUTH_GRPC_PACKAGE`, `AUTH_PROTO_FILE` from `@app/shared` (Task 1/2).
- Produces: the running auth process now listens on `0.0.0.0:${AUTH_GRPC_PORT ?? 50051}` instead of consuming from Kafka — consumed operationally by Task 13 (docker-compose).

- [ ] **Step 1: Rewrite the file**

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { AuthModule } from './auth.module';
import { protoPath, AUTH_GRPC_PACKAGE, AUTH_PROTO_FILE } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.GRPC,
      options: {
        package: AUTH_GRPC_PACKAGE,
        protoPath: protoPath(AUTH_PROTO_FILE),
        url: `0.0.0.0:${process.env.AUTH_GRPC_PORT ?? '50051'}`,
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: () =>
        new RpcException({ code: status.INVALID_ARGUMENT, message: 'Validation failed' }),
    }),
  );

  await app.listen();
}
bootstrap();
```

(The old "force image rebuild" comment tied to a stale-image CI incident is dropped along with the rest of the Kafka bootstrap — it no longer applies once the transport itself changes.)

- [ ] **Step 2: Manual verification (no automated test — this is a bootstrap file with no exported unit)**

Run: `AUTH_GRPC_PORT=50051 JWT_SECRET=test AUTH_DATABASE_URL=<local-postgres-url> npx nest start auth`
Expected: log output showing the microservice started with no errors, no Kafka connection attempts.

- [ ] **Step 3: Commit**

```bash
git add apps/auth/src/main.ts
git commit -m "feat(auth): bootstrap as a gRPC microservice instead of Kafka"
```

---

### Task 7: Events service — fix the one RpcException status code

**Files:**
- Modify: `apps/events/src/events.service.ts:1-2,162-163`
- Test: `apps/events/src/events.service.spec.ts` (new — targeted, not a full rewrite of test coverage for the whole service)

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes.

- [ ] **Step 1: Write the failing test**

```ts
// apps/events/src/events.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { status } from '@grpc/grpc-js';
import { EventsService } from './events.service';
import { PrismaService } from './prisma.service';
import { RedisCacheService } from './redis-cache.service';
import { EVENTS_KAFKA_PRODUCER } from '@app/shared';

describe('EventsService', () => {
  let service: EventsService;
  const prisma = { event: { findUnique: jest.fn() } };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const producer = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: cache },
        { provide: EVENTS_KAFKA_PRODUCER, useValue: producer },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('findOne throws NOT_FOUND for a missing event', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.findOne({ eventId: 'missing' })).rejects.toMatchObject({
      error: { code: status.NOT_FOUND, message: 'Event not found' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/events/src/events.service.spec.ts`
Expected: FAIL — the thrown payload still has `statusCode: 404`.

- [ ] **Step 3: Fix the throw site**

Edit `apps/events/src/events.service.ts`. Add the import alongside the existing `RpcException` import:

```ts
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
```

Change the throw:

```ts
    if (!event)
      throw new RpcException({ code: status.NOT_FOUND, message: 'Event not found' });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/events/src/events.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/events/src/events.service.ts apps/events/src/events.service.spec.ts
git commit -m "fix(events): use grpc status code in RpcException payload"
```

---

### Task 8: Events controller — migrate to `@GrpcMethod`

**Files:**
- Modify: `apps/events/src/events.controller.ts` (full rewrite)
- Modify: `apps/events/src/events.controller.spec.ts` (full rewrite)

**Interfaces:**
- Consumes: `EventsServiceClient`'s request/response shapes from `libs/shared/src/events-svc.contracts.ts` (Task 3). Consumes `EventsService` methods unchanged.
- Produces: nothing new for other tasks — leaf adapter.

- [ ] **Step 1: Write the failing test**

```ts
// apps/events/src/events.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const sampleEvent = {
  eventId: '1',
  userId: 'u1',
  title: 'Title',
  description: 'Desc',
  date: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-02T00:00:00.000Z'),
};

describe('EventsController', () => {
  let controller: EventsController;
  const eventsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findFollowedByUser: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
    announce: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: eventsService }],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findOne converts Date fields to ISO strings on the wire', async () => {
    eventsService.findOne.mockResolvedValue(sampleEvent);
    const result = await controller.findOne({ eventId: '1' });
    expect(result).toEqual({
      eventId: '1',
      userId: 'u1',
      title: 'Title',
      description: 'Desc',
      date: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
  });

  it('update converts optional undefined fields to undefined dto fields', async () => {
    eventsService.update.mockResolvedValue(sampleEvent);
    await controller.update({ eventId: '1', userId: 'u1', title: 'New' });
    expect(eventsService.update).toHaveBeenCalledWith({
      eventId: '1',
      userId: 'u1',
      title: 'New',
    });
  });

  it('delete returns an empty message', async () => {
    eventsService.delete.mockResolvedValue(undefined);
    const result = await controller.delete({ eventId: '1', userId: 'u1' });
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/events/src/events.controller.spec.ts`
Expected: FAIL — controller still uses `@MessagePattern`/Kafka DTOs, no `toWire` conversion.

- [ ] **Step 3: Rewrite the controller**

```ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EventsService } from './events.service';
import type {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  FindEventDto,
  FindEventsByUserDto,
  FollowEventDto,
  AnnounceEventDto,
  EventDto,
  CreateEventRequest,
  FindAllRequest,
  FindEventRequest,
  FindEventsByUserRequest,
  UpdateEventRequest,
  DeleteEventRequest,
  FollowEventRequest,
  AnnounceEventRequest,
  EventDtoWire,
  EventListWire,
  AnnounceResponseWire,
} from '@app/shared';
import { Empty } from '@app/shared';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @GrpcMethod('EventsService', 'Create')
  async create(data: CreateEventRequest): Promise<EventDtoWire> {
    const dto: CreateEventDto = {
      userId: data.userId,
      title: data.title,
      description: data.description,
      date: new Date(data.date),
    };
    return this.toWire(await this.eventsService.create(dto));
  }

  @GrpcMethod('EventsService', 'FindAll')
  async findAll(data: FindAllRequest): Promise<EventListWire> {
    const events = await this.eventsService.findAll(data.callerUserId);
    return { events: events.map((e) => this.toWire(e)) };
  }

  @GrpcMethod('EventsService', 'FindFollowedByUser')
  async findFollowedByUser(data: FindEventsByUserRequest): Promise<EventListWire> {
    const dto: FindEventsByUserDto = { userId: data.userId };
    const events = await this.eventsService.findFollowedByUser(dto);
    return { events: events.map((e) => this.toWire(e)) };
  }

  @GrpcMethod('EventsService', 'FindOne')
  async findOne(data: FindEventRequest): Promise<EventDtoWire> {
    const dto: FindEventDto = { eventId: data.eventId };
    return this.toWire(await this.eventsService.findOne(dto));
  }

  @GrpcMethod('EventsService', 'Update')
  async update(data: UpdateEventRequest): Promise<EventDtoWire> {
    const dto: UpdateEventDto = {
      eventId: data.eventId,
      userId: data.userId,
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
    };
    return this.toWire(await this.eventsService.update(dto));
  }

  @GrpcMethod('EventsService', 'Delete')
  async delete(data: DeleteEventRequest): Promise<Empty> {
    const dto: DeleteEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.delete(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Follow')
  async follow(data: FollowEventRequest): Promise<Empty> {
    const dto: FollowEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.follow(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Unfollow')
  async unfollow(data: FollowEventRequest): Promise<Empty> {
    const dto: FollowEventDto = { eventId: data.eventId, userId: data.userId };
    await this.eventsService.unfollow(dto);
    return {};
  }

  @GrpcMethod('EventsService', 'Announce')
  announce(data: AnnounceEventRequest): Promise<AnnounceResponseWire> {
    const dto: AnnounceEventDto = {
      eventId: data.eventId,
      title: data.title,
      body: data.body,
    };
    return this.eventsService.announce(dto);
  }

  private toWire(e: EventDto): EventDtoWire {
    return {
      eventId: e.eventId,
      userId: e.userId,
      title: e.title,
      description: e.description,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      ...(e.isFollowing !== undefined && { isFollowing: e.isFollowing }),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/events/src/events.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/events/src/events.controller.ts apps/events/src/events.controller.spec.ts
git commit -m "feat(events): migrate controller from Kafka MessagePattern to GrpcMethod"
```

---

### Task 9: Events bootstrap — switch to gRPC transport

**Files:**
- Modify: `apps/events/src/main.ts` (full rewrite)

**Interfaces:**
- Consumes: `protoPath`, `EVENTS_GRPC_PACKAGE`, `EVENTS_PROTO_FILE` from `@app/shared`.
- Produces: the running events process listens on `0.0.0.0:${EVENTS_GRPC_PORT ?? 50052}` — consumed operationally by Task 13. Note: `EventsModule` keeps its own `ClientsModule.register([kafkaClientConfig(EVENTS_KAFKA_PRODUCER)])` registration untouched (Task File Structure) — that's a separate Kafka *client* connection for the events→notifications fire-and-forget emits, unrelated to which transport this app itself listens on.

- [ ] **Step 1: Rewrite the file**

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { EventsModule } from './events.module';
import { protoPath, EVENTS_GRPC_PACKAGE, EVENTS_PROTO_FILE } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EventsModule,
    {
      transport: Transport.GRPC,
      options: {
        package: EVENTS_GRPC_PACKAGE,
        protoPath: protoPath(EVENTS_PROTO_FILE),
        url: `0.0.0.0:${process.env.EVENTS_GRPC_PORT ?? '50052'}`,
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: () =>
        new RpcException({ code: status.INVALID_ARGUMENT, message: 'Validation failed' }),
    }),
  );

  await app.listen();
}
bootstrap();
```

- [ ] **Step 2: Manual verification**

Run: `EVENTS_GRPC_PORT=50052 EVENTS_DATABASE_URL=<local-postgres-url> KAFKA_BROKER=localhost:29092 REDIS_HOST=localhost npx nest start events`
Expected: log output showing the microservice started with no errors; the app still connects its Kafka *producer* client (for notifications fan-out) even though it's no longer a Kafka *consumer*.

- [ ] **Step 3: Commit**

```bash
git add apps/events/src/main.ts
git commit -m "feat(events): bootstrap as a gRPC microservice instead of Kafka"
```

---

### Task 10: Gateway — register gRPC clients and rewrite `ApiGatewayService`

**Files:**
- Modify: `apps/api-gateway/src/api-gateway.module.ts` (full rewrite)
- Modify: `apps/api-gateway/src/api-gateway.service.ts` (full rewrite)
- Create: `apps/api-gateway/src/api-gateway.service.spec.ts`

**Interfaces:**
- Consumes: `AuthServiceClient`/`EventsServiceClient` and their wire types (Tasks 2/3), `grpcClientConfig` (Task 1).
- Produces: `ApiGatewayService`'s public method signatures (`register`, `login`, `getProfile`, `listUsers`, `deleteUser`, `createEvent`, `findAllEvents`, `findMyEvents`, `findEvent`, `updateEvent`, `deleteEvent`, `followEvent`, `unfollowEvent`, `announceEvent`, `sendNotification`, `broadcast`, `registerDeviceToken`, `listMyNotifications`, `listAllNotifications`) are **unchanged** — `ApiGatewayController` requires zero edits (confirmed via grep: it only calls these methods by name, never touches `ClientKafka`/`ClientGrpc` directly).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-gateway/src/api-gateway.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { ApiGatewayService } from './api-gateway.service';
import { AUTH_SERVICE, EVENTS_SERVICE, NOTIFICATIONS_SERVICE } from '@app/shared';

describe('ApiGatewayService', () => {
  let service: ApiGatewayService;
  const authGrpcService = {
    getProfile: jest.fn(() => of({ userId: '1', email: 'a@b.com', name: 'A' })),
    listUsers: jest.fn(() =>
      of({
        users: [
          { userId: '1', email: 'a@b.com', name: 'A', createdAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    ),
  };
  const eventsGrpcService = {
    findOne: jest.fn(() =>
      of({
        eventId: '1',
        userId: 'u1',
        title: 'T',
        description: 'D',
        date: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      }),
    ),
  };
  const authClient = { getService: jest.fn(() => authGrpcService) };
  const eventsClient = { getService: jest.fn(() => eventsGrpcService) };
  const notificationsClient = {
    subscribeToResponseOf: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiGatewayService,
        { provide: AUTH_SERVICE, useValue: authClient },
        { provide: EVENTS_SERVICE, useValue: eventsClient },
        { provide: NOTIFICATIONS_SERVICE, useValue: notificationsClient },
      ],
    }).compile();

    service = module.get<ApiGatewayService>(ApiGatewayService);
    await service.onModuleInit();
  });

  it('listUsers converts createdAt back to a real Date', async () => {
    const result = await service.listUsers();
    expect(result).toEqual([
      { userId: '1', email: 'a@b.com', name: 'A', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    expect(result[0].createdAt).toBeInstanceOf(Date);
  });

  it('findEvent converts date/createdAt/updatedAt back to real Dates', async () => {
    const result = await service.findEvent('1');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('onModuleInit still wires up the notifications Kafka client', () => {
    expect(notificationsClient.subscribeToResponseOf).toHaveBeenCalledWith(
      'notifications.send-to-user',
    );
    expect(notificationsClient.connect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/api-gateway/src/api-gateway.service.spec.ts`
Expected: FAIL — `ApiGatewayService` still expects `ClientKafka` for auth/events and has no `onModuleInit`-driven `getService()` calls.

- [ ] **Step 3: Rewrite the module**

```ts
// apps/api-gateway/src/api-gateway.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  kafkaClientConfig,
  grpcClientConfig,
  AUTH_GRPC_PACKAGE,
  AUTH_PROTO_FILE,
  EVENTS_GRPC_PACKAGE,
  EVENTS_PROTO_FILE,
} from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([
      grpcClientConfig(
        AUTH_SERVICE,
        AUTH_GRPC_PACKAGE,
        AUTH_PROTO_FILE,
        process.env.AUTH_GRPC_URL ?? 'localhost:50051',
      ),
      grpcClientConfig(
        EVENTS_SERVICE,
        EVENTS_GRPC_PACKAGE,
        EVENTS_PROTO_FILE,
        process.env.EVENTS_GRPC_URL ?? 'localhost:50052',
      ),
      kafkaClientConfig(NOTIFICATIONS_SERVICE),
    ]),
  ],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayService],
})
export class ApiGatewayModule {}
```

- [ ] **Step 4: Rewrite the service**

```ts
// apps/api-gateway/src/api-gateway.service.ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc, ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  NotificationsPatterns,
  KafkaTopics,
  AuthServiceClient,
  EventsServiceClient,
  UserSummary,
  EventDto,
  EventDtoWire,
  RegisterDto,
  LoginDto,
  CreateEventDto,
  UpdateEventDto,
  AnnounceEventDto,
  SendToUserDto,
  BroadcastDto,
  NotificationBroadcastEvent,
} from '@app/shared';

@Injectable()
export class ApiGatewayService implements OnModuleInit {
  private authGrpc: AuthServiceClient;
  private eventsGrpc: EventsServiceClient;

  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientGrpc,
    @Inject(EVENTS_SERVICE) private readonly eventsClient: ClientGrpc,
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.authGrpc = this.authClient.getService<AuthServiceClient>('AuthService');
    this.eventsGrpc = this.eventsClient.getService<EventsServiceClient>('EventsService');

    this.notificationsClient.subscribeToResponseOf(NotificationsPatterns.SEND_TO_USER);
    this.notificationsClient.subscribeToResponseOf(NotificationsPatterns.FIND_BY_USER);
    this.notificationsClient.subscribeToResponseOf(NotificationsPatterns.FIND_ALL);
    this.notificationsClient.subscribeToResponseOf('notifications.register-token');

    await this.notificationsClient.connect();
  }

  register(dto: RegisterDto) {
    return firstValueFrom(this.authGrpc.register(dto));
  }

  login(dto: LoginDto) {
    return firstValueFrom(this.authGrpc.login(dto));
  }

  getProfile(userId: string) {
    return firstValueFrom(this.authGrpc.getProfile({ userId }));
  }

  async listUsers(): Promise<UserSummary[]> {
    const { users } = await firstValueFrom(this.authGrpc.listUsers({}));
    return users.map((u) => ({ ...u, createdAt: new Date(u.createdAt) }));
  }

  async deleteUser(userId: string): Promise<void> {
    await firstValueFrom(this.authGrpc.deleteUser({ userId }));
  }

  async createEvent(dto: CreateEventDto): Promise<EventDto> {
    const wire = await firstValueFrom(
      this.eventsGrpc.create({ ...dto, date: dto.date.toISOString() }),
    );
    return this.toEventDto(wire);
  }

  // Discovery browse — every event. callerUserId (if the request was
  // authenticated) gets each item annotated with isFollowing.
  async findAllEvents(callerUserId?: string): Promise<EventDto[]> {
    const { events } = await firstValueFrom(this.eventsGrpc.findAll({ callerUserId }));
    return events.map((e) => this.toEventDto(e));
  }

  // "My events" now means events the user follows, not events they created
  // (event creation is admin-only).
  async findMyEvents(userId: string): Promise<EventDto[]> {
    const { events } = await firstValueFrom(
      this.eventsGrpc.findFollowedByUser({ userId }),
    );
    return events.map((e) => this.toEventDto(e));
  }

  async findEvent(eventId: string): Promise<EventDto> {
    const wire = await firstValueFrom(this.eventsGrpc.findOne({ eventId }));
    return this.toEventDto(wire);
  }

  async updateEvent(dto: UpdateEventDto): Promise<EventDto> {
    const wire = await firstValueFrom(
      this.eventsGrpc.update({ ...dto, date: dto.date?.toISOString() }),
    );
    return this.toEventDto(wire);
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.delete({ eventId, userId }));
  }

  async followEvent(userId: string, eventId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.follow({ userId, eventId }));
  }

  async unfollowEvent(userId: string, eventId: string): Promise<void> {
    await firstValueFrom(this.eventsGrpc.unfollow({ userId, eventId }));
  }

  announceEvent(dto: AnnounceEventDto) {
    return firstValueFrom(this.eventsGrpc.announce(dto));
  }

  sendNotification(dto: SendToUserDto) {
    return firstValueFrom(
      this.notificationsClient.send(NotificationsPatterns.SEND_TO_USER, dto),
    );
  }

  // Fire-and-forget: emit the broadcast to Kafka and return once the broker has
  // acked the produce. The heavy 100k-device fan-out happens in the worker, so
  // the HTTP request never blocks on delivery.
  broadcast(dto: BroadcastDto, requestedBy: string) {
    const event: NotificationBroadcastEvent = {
      title: dto.title,
      body: dto.body,
      data: dto.data,
      eventId: dto.eventId,
      requestedBy,
      requestedAt: new Date(),
    };
    return firstValueFrom(
      this.notificationsClient.emit(KafkaTopics.NOTIFICATION_BROADCAST, event),
    );
  }

  registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
  ) {
    return firstValueFrom(
      this.notificationsClient.send('notifications.register-token', {
        userId,
        token,
        platform,
      }),
    );
  }

  listMyNotifications(userId: string) {
    return firstValueFrom(
      this.notificationsClient.send(NotificationsPatterns.FIND_BY_USER, { userId }),
    );
  }

  listAllNotifications() {
    return firstValueFrom(this.notificationsClient.send(NotificationsPatterns.FIND_ALL, {}));
  }

  private toEventDto(w: EventDtoWire): EventDto {
    return {
      eventId: w.eventId,
      userId: w.userId,
      title: w.title,
      description: w.description,
      date: new Date(w.date),
      createdAt: new Date(w.createdAt),
      updatedAt: new Date(w.updatedAt),
      ...(w.isFollowing !== undefined && { isFollowing: w.isFollowing }),
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest apps/api-gateway/src/api-gateway.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the whole gateway app still compiles**

Run: `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
Expected: remaining errors only in `apps/api-gateway/src/guards/jwt-auth.guard.ts` (fixed in Task 11) and `apps/api-gateway/src/filters/all-exceptions.filter.ts` (fixed in Task 12, though this one doesn't actually error — it's a correctness gap, not a type error).

- [ ] **Step 7: Commit**

```bash
git add apps/api-gateway/src/api-gateway.module.ts apps/api-gateway/src/api-gateway.service.ts apps/api-gateway/src/api-gateway.service.spec.ts
git commit -m "feat(gateway): call auth/events over gRPC, keep notifications on Kafka"
```

---

### Task 11: Gateway — `JwtAuthGuard` over gRPC

**Files:**
- Modify: `apps/api-gateway/src/guards/jwt-auth.guard.ts` (full rewrite)
- Create: `apps/api-gateway/src/guards/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthServiceClient` (Task 2).
- Produces: no change to `canActivate`'s external behavior — still sets `request.user = payload` and returns `true`/throws `UnauthorizedException`, consumed by every guarded route unchanged.

Why the constructor (not `OnModuleInit`) grabs the service: `apps/api-gateway/src/main.ts:34` constructs this guard manually (`new JwtAuthGuard(reflector, app.get('AUTH_SERVICE'))`), bypassing Nest's DI lifecycle — `OnModuleInit` would never fire on it. `ClientGrpc.getService()` is synchronous (it just builds a proxy from the already-parsed proto definition; the underlying channel connects lazily on first call), so calling it directly in the constructor works with no lifecycle hook needed.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-gateway/src/guards/jwt-auth.guard.spec.ts
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const validateToken = jest.fn();
  const authClient = { getService: () => ({ validateToken }) };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;

  const contextFor = (headers: Record<string, string>) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  it('sets request.user and returns true for a valid token', async () => {
    validateToken.mockReturnValue(of({ userId: '1', email: 'a@b.com' }));
    const guard = new JwtAuthGuard(reflector, authClient as any);
    const ctx = contextFor({ authorization: 'Bearer good-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(validateToken).toHaveBeenCalledWith({ token: 'good-token' });
  });

  it('throws Unauthorized when the gRPC call rejects', async () => {
    validateToken.mockReturnValue(throwError(() => new Error('invalid')));
    const guard = new JwtAuthGuard(reflector, authClient as any);
    const ctx = contextFor({ authorization: 'Bearer bad-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized when no bearer header is present', async () => {
    const guard = new JwtAuthGuard(reflector, authClient as any);
    const ctx = contextFor({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/api-gateway/src/guards/jwt-auth.guard.spec.ts`
Expected: FAIL — the guard still expects a `ClientProxy` with `.send()`, not a `ClientGrpc` with `.getService()`.

- [ ] **Step 3: Rewrite the guard**

```ts
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE, AuthServiceClient, TokenPayload } from '@app/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly authGrpc: AuthServiceClient;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_SERVICE) authClient: ClientGrpc,
  ) {
    this.authGrpc = authClient.getService<AuthServiceClient>('AuthService');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: TokenPayload }>();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer '))
      throw new UnauthorizedException('Missing token');

    const token = authHeader.slice(7);
    try {
      const payload = await firstValueFrom(this.authGrpc.validateToken({ token }));
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/api-gateway/src/guards/jwt-auth.guard.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/guards/jwt-auth.guard.ts apps/api-gateway/src/guards/jwt-auth.guard.spec.ts
git commit -m "feat(gateway): validate tokens over the auth gRPC client"
```

---

### Task 12: Gateway — map gRPC errors to HTTP status codes

**Files:**
- Modify: `apps/api-gateway/src/filters/all-exceptions.filter.ts` (full rewrite)
- Create: `apps/api-gateway/src/filters/all-exceptions.filter.spec.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: no change to the JSON error response shape (`{ success, statusCode, message, errors?, timestamp }`).

Why this is necessary: `@nestjs/microservices`' base `ClientProxy.serializeError()` is a passthrough (`(err) => err`) for every transport, including gRPC. On the client side (the gateway), a failed gRPC call rejects with the raw `@grpc/grpc-js` `ServiceError` object — `{ code, details, message, metadata }` — never wrapped in an `RpcException`. `grpc-js` builds `.message` as `` `${code} ${STATUS_NAME}: ${details}` `` (see `@grpc/grpc-js/build/src/call.js:callErrorFromStatus`), so `.details` is the clean message text set by the microservice's `RpcException`, while `.message` has the numeric prefix. The existing filter's `instanceof RpcException` branch never matches these — it would fall through to the generic 500 branch, hiding a 401/404/409 behind "Internal server error".

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-gateway/src/filters/all-exceptions.filter.spec.ts
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status: statusMock }) }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps a grpc NOT_FOUND ServiceError to HTTP 404', () => {
    const grpcError = Object.assign(new Error(`${status.NOT_FOUND} NOT_FOUND: User not found`), {
      code: status.NOT_FOUND,
      details: 'User not found',
      metadata: {},
    });

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.NOT_FOUND, message: 'User not found' }),
    );
  });

  it('maps a grpc UNAUTHENTICATED ServiceError to HTTP 401', () => {
    const grpcError = Object.assign(
      new Error(`${status.UNAUTHENTICATED} UNAUTHENTICATED: Invalid credentials`),
      { code: status.UNAUTHENTICATED, details: 'Invalid credentials', metadata: {} },
    );

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('falls back to 502 for an unmapped grpc code', () => {
    const grpcError = Object.assign(new Error('14 UNAVAILABLE: down'), {
      code: status.UNAVAILABLE,
      details: 'down',
      metadata: {},
    });

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/api-gateway/src/filters/all-exceptions.filter.spec.ts`
Expected: FAIL — the filter has no branch that recognizes a plain `ServiceError`-shaped object, so every case falls through to the generic 500 branch.

- [ ] **Step 3: Rewrite the filter**

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';

interface GrpcServiceError {
  code: number;
  details: string;
  message: string;
}

function isGrpcServiceError(error: unknown): error is GrpcServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as GrpcServiceError).code === 'number' &&
    typeof (error as GrpcServiceError).details === 'string'
  );
}

const GRPC_TO_HTTP_STATUS: Partial<Record<number, HttpStatus>> = {
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? message;
        errors = b.errors as unknown[] | undefined;
      } else {
        message = String(body);
      }
    } else if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      if (typeof rpcError === 'object' && rpcError !== null) {
        const e = rpcError as Record<string, unknown>;
        status = (e.statusCode as number) ?? HttpStatus.BAD_GATEWAY;
        message = (e.message as string) ?? message;
      }
    } else if (isGrpcServiceError(exception)) {
      // Errors from the AUTH_SERVICE/EVENTS_SERVICE gRPC clients surface here as
      // plain grpc-js ServiceError objects, never wrapped in RpcException on the
      // client side (see @nestjs/microservices ClientProxy.serializeError, which
      // is a passthrough for every transport). `.details` is the clean message
      // text the microservice threw; `.message` has a "<code> <NAME>:" prefix.
      status = GRPC_TO_HTTP_STATUS[exception.code] ?? HttpStatus.BAD_GATEWAY;
      message = exception.details || exception.message || message;
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/api-gateway/src/filters/all-exceptions.filter.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/filters/all-exceptions.filter.ts apps/api-gateway/src/filters/all-exceptions.filter.spec.ts
git commit -m "fix(gateway): map grpc ServiceError codes to HTTP statuses"
```

---

### Task 13: Infra — Dockerfile, docker-compose, env vars

**Files:**
- Modify: `Dockerfile:20-25`
- Modify: `docker-compose.dev.yml:97-165` (api-gateway, auth, events blocks)
- Modify: `docker-compose.prod.yml:102-174` (api-gateway, auth, events blocks)
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing (infra-only task).
- Produces: `AUTH_GRPC_PORT`, `AUTH_GRPC_URL`, `EVENTS_GRPC_PORT`, `EVENTS_GRPC_URL` env vars — consumed at runtime by `main.ts`/`api-gateway.module.ts` from Tasks 6, 9, 10 (those already default sensibly when the vars are unset, so this task can land independently, but running end-to-end requires it).

- [ ] **Step 1: Copy the proto directory into the Docker runner stage**

Edit `Dockerfile`, in the `runner` stage:

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
ARG SERVICE_NAME
COPY --from=builder /app/dist/apps/${SERVICE_NAME} ./dist
COPY --from=builder /app/libs/shared/src/proto ./libs/shared/src/proto
CMD ["node", "dist/main"]
```

(Webpack bundles all TS — including everything imported from `@app/shared` — directly into `dist/main.js`, so no other source needs copying. Only the `.proto` files are non-TS assets that `@grpc/proto-loader` reads from disk at runtime, hence the explicit copy.)

- [ ] **Step 2: Update `docker-compose.dev.yml`**

In the `api-gateway` block, add to `environment`:

```yaml
      AUTH_GRPC_URL: auth:50051
      EVENTS_GRPC_URL: events:50052
```

In the `auth` block: remove `KAFKA_BROKER: kafka:29092` and the `kafka: condition: service_healthy` dependency (auth no longer talks to Kafka at all), add `AUTH_GRPC_PORT: "50051"`, and expose the port for local `grpcurl` debugging:

```yaml
  auth:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        SERVICE_NAME: auth
    ports:
      - "50051:50051"
    env_file: .env
    environment:
      NODE_ENV: development
      AUTH_GRPC_PORT: "50051"
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      AUTH_DATABASE_URL: postgresql://${POSTGRES_AUTH_USER:-auth_app}:${POSTGRES_AUTH_PASSWORD:-auth_pass}@postgres:5432/auth_db
    networks:
      - backend
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    develop:
      watch:
        - path: ./apps/auth
          action: rebuild
        - path: ./libs
          action: rebuild
        - path: ./package.json
          action: rebuild
        - path: ./Dockerfile
          action: rebuild
```

In the `events` block: keep `KAFKA_BROKER`/the `kafka` dependency (events still needs its Kafka *producer* client for the notifications fan-out), add `EVENTS_GRPC_PORT` and expose the port:

```yaml
  events:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        SERVICE_NAME: events
    ports:
      - "50052:50052"
    env_file: .env
    environment:
      NODE_ENV: development
      KAFKA_BROKER: kafka:29092
      EVENTS_GRPC_PORT: "50052"
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      EVENTS_DATABASE_URL: postgresql://${POSTGRES_EVENTS_USER:-events_app}:${POSTGRES_EVENTS_PASSWORD:-events_pass}@postgres:5432/events_db
    networks:
      - backend
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
      redis:
        condition: service_healthy
    develop:
      watch:
        - path: ./apps/events
          action: rebuild
        - path: ./libs
          action: rebuild
        - path: ./package.json
          action: rebuild
        - path: ./Dockerfile
          action: rebuild
```

- [ ] **Step 3: Update `docker-compose.prod.yml`**

Same three edits as Step 2, applied to the prod file's `api-gateway`/`auth`/`events` blocks — but do **not** add `ports:` for `auth`/`events` in prod (no need to expose internal service ports to the host in production; only `api-gateway` and `frontend` are host-exposed there):

`api-gateway` environment gains:
```yaml
      AUTH_GRPC_URL: auth:50051
      EVENTS_GRPC_URL: events:50052
```

`auth` block: remove `KAFKA_BROKER: kafka:29092` and the `kafka` dependency, add `AUTH_GRPC_PORT: "50051"`:

```yaml
  auth:
    image: ghcr.io/maikvibes/events-fsa-auth:${IMAGE_TAG:-dev}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      AUTH_GRPC_PORT: "50051"
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      AUTH_DATABASE_URL: postgresql://${POSTGRES_AUTH_USER:-auth_app}:${POSTGRES_AUTH_PASSWORD:-auth_pass}@postgres:5432/auth_db
    networks:
      - backend
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

`events` block: keep Kafka wiring, add `EVENTS_GRPC_PORT`:

```yaml
  events:
    image: ghcr.io/maikvibes/events-fsa-events:${IMAGE_TAG:-dev}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      KAFKA_BROKER: kafka:29092
      EVENTS_GRPC_PORT: "50052"
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      EVENTS_DATABASE_URL: postgresql://${POSTGRES_EVENTS_USER:-events_app}:${POSTGRES_EVENTS_PASSWORD:-events_pass}@postgres:5432/events_db
    networks:
      - backend
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
      redis:
        condition: service_healthy
```

- [ ] **Step 4: Document the new env vars**

Edit `.env.example`, adding after the `--- Kafka ---` section:

```
# --- gRPC (gateway -> auth/events) ---
# Server-side bind ports (auth/events main.ts) and client-side connection
# URLs (api-gateway). In docker-compose these resolve via service-name DNS.
AUTH_GRPC_PORT=50051
AUTH_GRPC_URL=auth:50051
EVENTS_GRPC_PORT=50052
EVENTS_GRPC_URL=events:50052
```

- [ ] **Step 5: Verify the compose files parse**

Run: `docker compose -f docker-compose.dev.yml config --quiet`
Expected: no output, exit code 0 (valid YAML/compose schema).

Run: `docker compose -f docker-compose.prod.yml config --quiet`
Expected: same.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.dev.yml docker-compose.prod.yml .env.example
git commit -m "chore(infra): wire gRPC ports/urls, drop Kafka from auth container"
```

---

### Task 14: End-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all suites pass, including every new/modified spec file from Tasks 4–12.

- [ ] **Step 2: Type-check the whole workspace**

Run: `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Bring the stack up and smoke-test the gateway**

Run: `npm run docker:up:dev`
Expected: all containers healthy; `auth`/`events` logs show `Nest microservice successfully started` with no Kafka connection errors; `api-gateway` logs show no gRPC channel errors.

- [ ] **Step 4: Exercise the migrated paths through the HTTP API**

```bash
# Register + login (exercises gateway -> auth gRPC, both success and the
# ALREADY_EXISTS/UNAUTHENTICATED error-mapping paths)
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"grpc-test@example.com","password":"password123","name":"gRPC Test"}'

curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"grpc-test@example.com","password":"password123","name":"gRPC Test"}'
# Expected: HTTP 409, body.message === "Email already in use"

curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"grpc-test@example.com","password":"wrong-password"}'
# Expected: HTTP 401, body.message === "Invalid credentials"
```

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"grpc-test@example.com","password":"password123"}' | jq -r .accessToken)

# Exercises gateway -> events gRPC, and the guard's gateway -> auth
# VALIDATE_TOKEN call, on every authenticated request below.
curl -s http://localhost:3000/api/v1/events -H "Authorization: Bearer $TOKEN"
# Expected: HTTP 200, JSON array (possibly empty) with real ISO date strings
# for `date`/`createdAt`/`updatedAt` on any event present.

curl -s http://localhost:3000/api/v1/events/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $TOKEN"
# Expected: HTTP 404, body.message === "Event not found"
```

Expected overall: every response's status code and message match what the pre-migration Kafka-based behavior produced (this is a transport swap, not a behavior change) — confirming the gRPC status → HTTP status mapping from Task 12 is correct end-to-end, not just in the unit tests.

- [ ] **Step 5: Confirm notifications is untouched**

```bash
curl -s http://localhost:3000/api/v1/notifications/me -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200 — still served over Kafka, unaffected by this migration.

- [ ] **Step 6: Tear down**

Run: `npm run docker:down:dev`

---

## Self-Review

**1. Spec coverage:** Every synchronous gateway↔auth and gateway↔events call site identified in research (7 auth patterns including the guard's `VALIDATE_TOKEN`, 9 events patterns) has a corresponding `@GrpcMethod`/`AuthServiceClient`/`EventsServiceClient` entry. Gateway↔notifications (4 patterns) and all `@EventPattern`/`.emit()` fire-and-forget paths are explicitly left on Kafka per the user's request ("gateway and events and auth microservices"), confirmed unmodified in Tasks 10/13. The `RpcException` error-propagation gap (a real correctness bug that would otherwise ship silently) is covered end-to-end: service-side code fix (Tasks 4/7), server bootstrap validation-error fix (Tasks 6/9), and gateway-side mapping (Task 12), with a live smoke test in Task 14 exercising both a 409 and a 401/404 path.

**2. Placeholder scan:** No "TBD"/"handle errors appropriately"/"similar to Task N" language — every task has complete, copy-pasteable code. The one place that could look like a placeholder — `Empty` interface using an index signature rather than a bare `{}` — is deliberate and explained in Task 1.

**3. Type consistency:** Verified `AuthServiceClient`/`EventsServiceClient` method names and payload shapes are identical across their definition (Tasks 2/3), their consumer in the gateway (Task 10), and their guard usage (Task 11). Verified `EventDtoWire`/`UserSummaryWire` field names match between the microservice controllers that produce them (Tasks 5/8) and the gateway that consumes them (Task 10). Verified the `.proto` message field names/order match the hand-written TS interfaces exactly (proto-loader maps by field name, not position, so this is required for correctness, not just cosmetic).

## Deferred / explicitly out of scope

- **Gateway↔notifications** stays on Kafka. Migrating it was not requested and notifications has both request/response and event-driven patterns mixed in the same controller — a separate, smaller follow-up plan if desired.
- **TLS between gateway and auth/events.** Matches the current unencrypted Kafka setup; would need certs wired through the same `scripts/generate-certs.sh`/`KAFKA_SSL_CA_PATH` mechanism already used for Kafka in prod.
- **Streaming gRPC** (server-streaming, bidi). Every migrated call is unary request/response, matching the Kafka `.send()` semantics being replaced.
- **Static codegen (`ts-proto`/`protoc`)** for the message/client types. Deliberately skipped to match this codebase's existing hand-written-contracts convention and avoid a new build-time toolchain; revisit if the `.proto` files grow large enough that manual drift becomes a real risk.
- **`AUTH_USER_CREATED`/`UPDATED`/`DELETED` `KafkaTopics`** were found to be dead constants (defined, never emitted or consumed) during research — unrelated to this migration, left alone.
