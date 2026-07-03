# Admin Users: RBAC Cutover + Pagination/Search/Filter/Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ADMIN_EMAILS` env-allowlist with a real DB-backed `role` field, then build a paginated, searchable, filterable, sortable admin Users table that scales to ~10k users.

**Architecture:** Add a Prisma `Role` enum (`user`/`admin`) to the `auth` service's `User` model, thread it through JWT issuance/validation, and cut `AdminGuard` over to check the token's role claim instead of the email allowlist. A one-time script seeds initial admins from the current `ADMIN_EMAILS` value. A new `PATCH /admin/users/:userId/role` endpoint lets admins manage roles going forward. Separately, rework `auth.service.findAll` to accept `page`/`pageSize`/`search`/`role`/`createdFrom`/`createdTo`/`sortBy`/`sortOrder`, using Prisma `where`/`orderBy`/`skip`/`take` and a parallel `count`, threaded end-to-end through the Kafka message pattern, the gateway's `GET /admin/users` query params, and the React Query hook, into a rewritten `UsersPanel` with debounced search, filter controls, sortable column headers, and pagination controls.

**Tech Stack:** NestJS (microservices over Kafka), Prisma ORM + `@prisma/adapter-pg` (Postgres), Zod (`nestjs-zod`) for request validation, React + TanStack Query v5, shadcn/ui (Base UI primitives) + Tailwind.

## Global Constraints

- JWT access-token lifetime changes from `7d` to `1h` (`apps/auth/src/auth.service.ts` `jwtExpiresIn`). There is no refresh-token exchange endpoint in this codebase yet (the `RefreshToken` table exists but is unused) — after this change, all users re-authenticate hourly. This is accepted as a known follow-up, not fixed in this plan.
- `AdminGuard` cutover is a hard cutover: it checks only `request.user.role === 'admin'` from the JWT. Old tokens issued before this deploy have no `role` claim and lose admin access immediately — combined with the 1h token lifetime, this self-heals within an hour as everyone re-logs in.
- Role values are the lowercase string literals `'user'` and `'admin'` everywhere (Prisma enum, shared TS type, Zod schema, frontend) — no casing translation layer.
- Default page size is 20; selectable page sizes are 10/20/50/100.
- Sorting is via clickable column headers (Name/Email/Joined), toggling asc/desc, backed by `sortBy`/`sortOrder` query params.
- Filtering is by `role` (exact match) and `createdAt` range (`createdFrom`/`createdTo`, inclusive, whole-day granularity). No `status`/`banned` field is introduced in this plan.
- Backend request-query validation follows the existing convention: a Zod schema in `libs/shared/src/schemas/auth.schemas.ts`, wrapped in `ZodValidationPipe` at the gateway. Response/message-pattern payload shapes (not request bodies) live in `libs/shared/src/auth.contracts.ts`, per the existing split (compare `RegisterDto`/`LoginDto` in schemas vs. `AuthResponse`/`UserSummary` in contracts).
- No new frontend test tooling is introduced (none exists in this repo today) — frontend tasks are verified manually via the dev server, matching existing project practice.

---

## File Structure

**Shared contracts/schemas:**
- `libs/shared/src/auth.contracts.ts` (modify) — add `Role` type, `UPDATE_USER_ROLE` pattern, `role` field on `AuthResponse`/`ProfileResponse`/`UserSummary`/`TokenPayload`, add `PaginatedUsers`.
- `libs/shared/src/schemas/auth.schemas.ts` (modify) — add `ListUsersQuerySchema`/`ListUsersQueryDto` and `UpdateUserRoleSchema`/`UpdateUserRoleDto`.

**Auth service (`apps/auth`):**
- `apps/auth/prisma/schema.prisma` (modify) — add `Role` enum and `role` column on `User`.
- `apps/auth/src/auth.service.ts` (modify) — role-aware register/login/getProfile/validateToken, 1h token lifetime, rewritten `findAll`, new `updateUserRole`.
- `apps/auth/src/auth.service.spec.ts` (create) — unit tests for the above.
- `apps/auth/src/auth.controller.ts` (modify) — wire `ListUsersQueryDto` payload and new `UPDATE_USER_ROLE` pattern.

**API gateway (`apps/api-gateway`):**
- `apps/api-gateway/src/guards/admin.guard.ts` (rewrite) — role-based check.
- `apps/api-gateway/src/guards/admin.guard.spec.ts` (create) — unit tests.
- `apps/api-gateway/src/dto/auth.dto.ts` (modify) — add `ListUsersQueryDto`/`UpdateUserRoleBodyDto` Zod DTO classes.
- `apps/api-gateway/src/api-gateway.controller.ts` (modify) — `listUsers` accepts validated query params; new `PATCH admin/users/:userId/role` route.
- `apps/api-gateway/src/api-gateway.service.ts` (modify) — `listUsers(query)` passthrough, new `updateUserRole`, new Kafka response subscription.

**One-time migration helper:**
- `scripts/seed-admin-roles.ts` (create) — promotes `ADMIN_EMAILS` accounts to `role='admin'`.
- `package.json` (modify, root) — add `seed:admin-roles` script.

**Frontend:**
- `frontend/src/types/index.ts` (modify) — add `Role`, `role` on `AuthUser`/`AdminUserSummary`, add `PaginatedAdminUsers`.
- `frontend/src/contexts/auth-context.tsx` (modify) — persist/expose `role`.
- `frontend/src/components/layout/app-sidebar.tsx` (modify) — hide "Administration" nav section for non-admins.
- `frontend/src/hooks/use-debounced-value.ts` (create) — generic debounce hook.
- `frontend/src/features/admin/api.ts` (modify) — `listUsers(token, params)` with querystring, `updateUserRole`.
- `frontend/src/features/admin/hooks.ts` (modify) — `useAdminUsers(params)` with `keepPreviousData`, new `useUpdateUserRole`.
- `frontend/src/features/admin/components/users-panel.tsx` (rewrite) — search, role/date filters, sortable headers, role editor, pagination controls.

---

### Task 1: Prisma schema — add `Role` enum and column

**Files:**
- Modify: `apps/auth/prisma/schema.prisma`
- Creates (via CLI, not hand-written): a new migration folder under `apps/auth/prisma/migrations/`

**Interfaces:**
- Produces: Prisma-generated `role: 'user' | 'admin'` field (default `'user'`) on every `User` row, consumed by all later auth.service tasks.

- [ ] **Step 1: Edit the schema**

In `apps/auth/prisma/schema.prisma`, add the enum and the field:

```prisma
enum Role {
  user
  admin
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  name          String
  password      String
  role          Role           @default(user)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
}
```

- [ ] **Step 2: Start the dev Postgres container (if not already running)**

Run: `docker compose -f docker-compose.dev.yml up -d postgres`
Expected: container `postgres` reports `running`/`healthy` in `docker compose -f docker-compose.dev.yml ps`.

- [ ] **Step 3: Generate and apply the migration**

Run: `npm run prisma:migrate:auth -- --name add_user_role`
Expected: Prisma prints a new migration folder name (e.g. `apps/auth/prisma/migrations/<timestamp>_add_user_role/migration.sql`) and `Your database is now in sync with your schema.` The generated SQL should be equivalent to:

```sql
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'user';
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npm run prisma:generate`
Expected: exits 0, regenerates `apps/auth/src/generated/prisma-client` including the new `role` field/enum.

- [ ] **Step 5: Commit**

```bash
git add apps/auth/prisma/schema.prisma apps/auth/prisma/migrations
git commit -m "feat(auth): add role column to User model"
```

---

### Task 2: Shared contracts and schemas for role + query DTOs

**Files:**
- Modify: `libs/shared/src/auth.contracts.ts`
- Modify: `libs/shared/src/schemas/auth.schemas.ts`

**Interfaces:**
- Produces: `Role` type, `PaginatedUsers`, extended `UserSummary`/`AuthResponse`/`ProfileResponse`/`TokenPayload`, `ListUsersQueryDto`, `UpdateUserRoleDto`, `AuthPatterns.UPDATE_USER_ROLE` — consumed by every later backend task.

- [ ] **Step 1: Update `libs/shared/src/auth.contracts.ts`**

```typescript
export const AuthPatterns = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  VALIDATE_TOKEN: 'auth.validate-token',
  GET_PROFILE: 'auth.get-profile',
  LIST_USERS: 'auth.list-users',
  DELETE_USER: 'auth.delete-user',
  UPDATE_USER_ROLE: 'auth.update-user-role',
} as const;

export type Role = 'user' | 'admin';

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  role: Role;
  accessToken: string;
}

export interface ProfileResponse {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface UserSummary {
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export interface PaginatedUsers {
  items: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
```

- [ ] **Step 2: Update `libs/shared/src/schemas/auth.schemas.ts`**

```typescript
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).trim(),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const ValidateTokenSchema = z.object({
  token: z.string().min(1),
});

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  role: z.enum(['user', 'admin']).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type ValidateTokenDto = z.infer<typeof ValidateTokenSchema>;
export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;
```

- [ ] **Step 3: Typecheck the shared lib**

Run: `npx tsc --noEmit -p libs/shared/tsconfig.lib.json` (if this project file doesn't exist, run `npx tsc --noEmit -p tsconfig.json` from the repo root instead)
Expected: no errors from `libs/shared/src` (errors from unrelated apps not yet updated in later tasks are expected at this point and will clear as subsequent tasks land).

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/auth.contracts.ts libs/shared/src/schemas/auth.schemas.ts
git commit -m "feat(shared): add role type and list-users query contracts"
```

---

### Task 3: Auth service — role-aware token issuance and validation

**Files:**
- Modify: `apps/auth/src/auth.service.ts`
- Create: `apps/auth/src/auth.service.spec.ts`

**Interfaces:**
- Consumes: `Role`, `AuthResponse`, `ProfileResponse`, `TokenPayload` from `@app/shared` (Task 2); `role` field on Prisma `User` (Task 1).
- Produces: `AuthService.register`/`login`/`getProfile`/`validateToken` all include `role`; `jwtExpiresIn = '1h'`.

- [ ] **Step 1: Write the failing tests**

Create `apps/auth/src/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const jwtSecret = 'test-secret';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => jwtSecret },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('signs the role claim into the token on register', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      name: 'New User',
      role: 'user',
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    expect(result.role).toBe('user');
    const decoded = jwt.verify(result.accessToken, jwtSecret) as jwt.JwtPayload;
    expect(decoded.role).toBe('user');
  });

  it('signs a 1 hour expiry on the token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      name: 'New User',
      role: 'user',
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    const decoded = jwt.verify(result.accessToken, jwtSecret) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(3600);
  });

  it('includes role on getProfile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });

    const result = await service.getProfile('u1');

    expect(result.role).toBe('admin');
  });

  it('extracts role from a validated token', () => {
    const token = jwt.sign(
      { userId: 'u1', email: 'admin@example.com', role: 'admin' },
      jwtSecret,
      { expiresIn: '1h' },
    );

    const result = service.validateToken({ token });

    expect(result.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: FAIL — `role` is `undefined` on results, and the current `jwtExpiresIn` is `'7d'` so the expiry-diff assertion fails (`decoded.exp! - decoded.iat!` is `604800`, not `3600`).

- [ ] **Step 3: Update `apps/auth/src/auth.service.ts`**

Change the imports and the four methods:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type {
  RegisterDto,
  LoginDto,
  ValidateTokenDto,
  ListUsersQueryDto,
} from '@app/shared';
import {
  AuthResponse,
  ProfileResponse,
  TokenPayload,
  KafkaTopics,
  UserSummary,
  PaginatedUsers,
  Role,
} from '@app/shared';
import { Prisma } from './generated/prisma-client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn = '1h';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    this.logger.log(`Registering: ${dto.email}`);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new RpcException({
        statusCode: 409,
        message: 'Email already in use',
      });

    const password = this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, password },
    });
    this.logger.debug(
      `Emit ${KafkaTopics.AUTH_USER_CREATED} userId=${user.id}`,
    );
    const accessToken = this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accessToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`Login: ${dto.email}`);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !this.verifyPassword(dto.password, user.password)) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    }
    const accessToken = this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accessToken,
    };
  }

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new RpcException({ statusCode: 404, message: 'User not found' });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async findAll(query: ListUsersQueryDto = {}): Promise<PaginatedUsers> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: users.map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      total: users.length,
      page: 1,
      pageSize: users.length,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch {
      throw new RpcException({ statusCode: 404, message: 'User not found' });
    }
  }

  validateToken(dto: ValidateTokenDto): TokenPayload {
    this.logger.log('Validating token');
    try {
      const payload = jwt.verify(dto.token, this.jwtSecret) as jwt.JwtPayload;
      return {
        userId: payload['userId'] as string,
        email: payload['email'] as string,
        role: payload['role'] as Role,
      };
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid or expired token',
      });
    }
  }

  private hashPassword(plain: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(plain + salt)
      .digest('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(plain: string, stored: string): boolean {
    if (stored.includes(':')) {
      const [salt, hash] = stored.split(':', 2);
      const expected = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(plain + salt)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    }
    const legacy = crypto.createHash('sha256').update(plain).digest('hex');
    return legacy === stored;
  }

  private signToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }
}
```

Note: `findAll` here is a deliberately temporary pass-through (ignores `query`, returns everything as one "page") — it only needs to satisfy this task's tests and compile against the new `PaginatedUsers` return type. Task 10 replaces its body with the real search/filter/sort/pagination logic; don't over-invest in it here.

The `Prisma` import is unused by this task's code but is required by Task 10's edit to the same file — if your linter fails on an unused import, remove the `import { Prisma } from './generated/prisma-client';` line for now and re-add it in Task 10.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/auth/src/auth.service.ts apps/auth/src/auth.service.spec.ts
git commit -m "feat(auth): sign and validate role claim, reduce token lifetime to 1h"
```

---

### Task 4: Auth service — `updateUserRole` + message pattern

**Files:**
- Modify: `apps/auth/src/auth.service.ts`
- Modify: `apps/auth/src/auth.service.spec.ts`
- Modify: `apps/auth/src/auth.controller.ts`

**Interfaces:**
- Consumes: `AuthPatterns.UPDATE_USER_ROLE`, `UpdateUserRoleDto` (Task 2).
- Produces: `AuthService.updateUserRole(userId: string, role: Role): Promise<UserSummary>`, consumed by the gateway in Task 6.

- [ ] **Step 1: Add the failing test**

Append to `apps/auth/src/auth.service.spec.ts` (inside the existing `describe('AuthService', ...)` block, after the last `it(...)`):

```typescript
  it('updates a user role', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'A User',
      role: 'admin',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.updateUserRole('u1', 'admin');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'admin' },
    });
    expect(result.role).toBe('admin');
  });

  it('throws on updateUserRole when the user does not exist', async () => {
    prisma.user.update.mockRejectedValue(new Error('not found'));

    await expect(service.updateUserRole('missing', 'admin')).rejects.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: FAIL with `service.updateUserRole is not a function`.

- [ ] **Step 3: Add `updateUserRole` to `apps/auth/src/auth.service.ts`**

Insert this method right after `deleteUser`:

```typescript
  async updateUserRole(userId: string, role: Role): Promise<UserSummary> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      };
    } catch {
      throw new RpcException({ statusCode: 404, message: 'User not found' });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the message pattern in `apps/auth/src/auth.controller.ts`**

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AuthPatterns, Role } from '@app/shared';
import type {
  RegisterDto,
  LoginDto,
  ValidateTokenDto,
  ListUsersQueryDto,
} from '@app/shared';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AuthPatterns.REGISTER)
  register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @MessagePattern(AuthPatterns.LOGIN)
  login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @MessagePattern(AuthPatterns.VALIDATE_TOKEN)
  validateToken(@Payload() dto: ValidateTokenDto) {
    return this.authService.validateToken(dto);
  }

  @MessagePattern(AuthPatterns.GET_PROFILE)
  getProfile(@Payload() dto: { userId: string }) {
    return this.authService.getProfile(dto.userId);
  }

  @MessagePattern(AuthPatterns.LIST_USERS)
  listUsers(@Payload() query: ListUsersQueryDto) {
    return this.authService.findAll(query);
  }

  @MessagePattern(AuthPatterns.DELETE_USER)
  deleteUser(@Payload() dto: { userId: string }) {
    return this.authService.deleteUser(dto.userId);
  }

  @MessagePattern(AuthPatterns.UPDATE_USER_ROLE)
  updateUserRole(@Payload() dto: { userId: string; role: Role }) {
    return this.authService.updateUserRole(dto.userId, dto.role);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/auth/src/auth.service.ts apps/auth/src/auth.service.spec.ts apps/auth/src/auth.controller.ts
git commit -m "feat(auth): add updateUserRole message pattern"
```

---

### Task 5: Gateway — cut `AdminGuard` over to role-based check

**Files:**
- Rewrite: `apps/api-gateway/src/guards/admin.guard.ts`
- Create: `apps/api-gateway/src/guards/admin.guard.spec.ts`

**Interfaces:**
- Consumes: `TokenPayload.role` (Task 2), populated on `request.user` by `JwtAuthGuard` (unchanged — it already forwards whatever `validateToken` returns).
- Produces: `AdminGuard` now requires `role === 'admin'`, no longer reads `ADMIN_EMAILS`.

- [ ] **Step 1: Write the failing test**

Create `apps/api-gateway/src/guards/admin.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function contextWithUser(user?: { role?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows a request whose token role is admin', () => {
    expect(guard.canActivate(contextWithUser({ role: 'admin' }))).toBe(true);
  });

  it('rejects a request whose token role is user', () => {
    expect(() => guard.canActivate(contextWithUser({ role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no user on it', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/api-gateway/src/guards/admin.guard.spec.ts`
Expected: FAIL — current guard checks `ADMIN_EMAILS`/`email`, so a `{ role: 'admin' }` user with no `email` is rejected.

- [ ] **Step 3: Rewrite `apps/api-gateway/src/guards/admin.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TokenPayload } from '@app/shared';

// Role-based admin gate: the JWT's `role` claim (set at register/login from
// the User.role DB column) is the source of truth. Runs after the global
// JwtAuthGuard, so request.user is set.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: TokenPayload }>();

    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/api-gateway/src/guards/admin.guard.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Remove `ADMIN_EMAILS` from env files**

Remove the `ADMIN_EMAILS=admin@eventfsa.local` line from `.env.example` (and from your local `.env` if present) — it's no longer read anywhere. Leave a one-line note in `.env.example` pointing at Task 7's seed script instead, e.g. replace that line with:

```
# Initial admin accounts are granted via `npm run seed:admin-roles` (see scripts/seed-admin-roles.ts), not this file.
```

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/guards/admin.guard.ts apps/api-gateway/src/guards/admin.guard.spec.ts .env.example
git commit -m "feat(gateway): cut AdminGuard over to role-based check"
```

---

### Task 6: Gateway — role update endpoint

**Files:**
- Modify: `apps/api-gateway/src/dto/auth.dto.ts`
- Modify: `apps/api-gateway/src/api-gateway.controller.ts`
- Modify: `apps/api-gateway/src/api-gateway.service.ts`

**Interfaces:**
- Consumes: `UpdateUserRoleSchema`/`UpdateUserRoleDto` (Task 2), `AuthService.updateUserRole` via `AuthPatterns.UPDATE_USER_ROLE` (Task 4).
- Produces: `PATCH /admin/users/:userId/role` — consumed by the frontend in Task 12.

- [ ] **Step 1: Add the DTO class in `apps/api-gateway/src/dto/auth.dto.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import { RegisterSchema, LoginSchema, UpdateUserRoleSchema } from '@app/shared';

export class RegisterBodyDto extends createZodDto(RegisterSchema) {}
export class LoginBodyDto extends createZodDto(LoginSchema) {}
export class UpdateUserRoleBodyDto extends createZodDto(UpdateUserRoleSchema) {}
```

- [ ] **Step 2: Add `updateUserRole` to `apps/api-gateway/src/api-gateway.service.ts`**

Add the import and the Kafka subscription in `onModuleInit`, and the method:

```typescript
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  AuthPatterns,
  EventsPatterns,
  NotificationsPatterns,
  KafkaTopics,
  RegisterDto,
  LoginDto,
  CreateEventDto,
  UpdateEventDto,
  AnnounceEventDto,
  SendToUserDto,
  BroadcastDto,
  NotificationBroadcastEvent,
  ListUsersQueryDto,
  Role,
} from '@app/shared';
```

In `onModuleInit`, add this line alongside the other `authClient.subscribeToResponseOf(...)` calls:

```typescript
    this.authClient.subscribeToResponseOf(AuthPatterns.UPDATE_USER_ROLE);
```

Replace the existing `listUsers()` method and add `updateUserRole`:

```typescript
  listUsers(query: ListUsersQueryDto = {}) {
    return firstValueFrom(this.authClient.send(AuthPatterns.LIST_USERS, query));
  }

  updateUserRole(userId: string, role: Role) {
    return firstValueFrom(
      this.authClient.send(AuthPatterns.UPDATE_USER_ROLE, { userId, role }),
    );
  }
```

- [ ] **Step 3: Update `apps/api-gateway/src/api-gateway.controller.ts`**

Add `Patch` to the `@nestjs/common` import, add `UpdateUserRoleBodyDto` to the dto import, and replace the `listUsers` route + add the new route:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
```

```typescript
import { RegisterBodyDto, LoginBodyDto, UpdateUserRoleBodyDto } from './dto/auth.dto';
```

```typescript
  @ApiTags('Admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @UseGuards(AdminGuard)
  @Get('admin/users')
  listUsers() {
    return this.apiGatewayService.listUsers();
  }

  @ApiTags('Admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: "Change a user's role (admin only)" })
  @ApiParam({ name: 'userId', description: 'UUID of the user' })
  @ApiBody({ type: UpdateUserRoleBodyDto })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UseGuards(AdminGuard)
  @Patch('admin/users/:userId/role')
  updateUserRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserRoleBodyDto,
  ) {
    return this.apiGatewayService.updateUserRole(userId, dto.role);
  }
```

(This still leaves `listUsers()` with no query params on purpose — Task 11 wires that in, so this task stays focused on the role-update endpoint only.)

- [ ] **Step 4: Typecheck the gateway app**

Run: `npx tsc --noEmit -p apps/api-gateway/tsconfig.app.json` (adjust the tsconfig filename if the project uses a different one — check `apps/api-gateway/tsconfig.app.json` exists first with `ls apps/api-gateway/*.json`)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/dto/auth.dto.ts apps/api-gateway/src/api-gateway.controller.ts apps/api-gateway/src/api-gateway.service.ts
git commit -m "feat(gateway): add PATCH /admin/users/:userId/role endpoint"
```

---

### Task 7: One-time admin-role seed script

**Files:**
- Create: `scripts/seed-admin-roles.ts`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `AUTH_DATABASE_URL`, `ADMIN_EMAILS` env vars; Prisma-generated client at `apps/auth/src/generated/prisma-client` (Task 1).

- [ ] **Step 1: Create `scripts/seed-admin-roles.ts`**

```typescript
// One-time cutover helper: promotes users whose email is in ADMIN_EMAILS to
// role='admin'. Safe to re-run — a no-op for users already at that role.
//
// Run with: node --env-file=.env -r ts-node/register/transpile-only scripts/seed-admin-roles.ts
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as AuthPrismaClient } from '../apps/auth/src/generated/prisma-client';

async function main() {
  const authUrl = process.env.AUTH_DATABASE_URL;
  if (!authUrl) {
    throw new Error(
      'AUTH_DATABASE_URL must be set (run via `node --env-file=.env ...`)',
    );
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.log('ADMIN_EMAILS is empty — nothing to seed.');
    return;
  }

  const authDb = new AuthPrismaClient({
    adapter: new PrismaPg(new pg.Pool({ connectionString: authUrl })),
  });

  try {
    const result = await authDb.user.updateMany({
      where: {
        OR: adminEmails.map((email) => ({
          email: { equals: email, mode: 'insensitive' as const },
        })),
      },
      data: { role: 'admin' },
    });
    console.log(`Promoted ${result.count} user(s) to admin: ${adminEmails.join(', ')}`);
  } finally {
    await authDb.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the root `package.json` script**

In the root `package.json`, add this entry next to the other `prisma:*`/`seed` scripts:

```json
    "seed:admin-roles": "node --env-file=.env -r ts-node/register/transpile-only scripts/seed-admin-roles.ts",
```

- [ ] **Step 3: Run it against your local dev DB**

Make sure `.env` has `ADMIN_EMAILS=admin@eventfsa.local` (or whichever email(s) you want promoted — comma-separated) set locally, then:

Run: `npm run seed:admin-roles`
Expected: prints `Promoted 1 user(s) to admin: admin@eventfsa.local` (count depends on how many of those emails already have accounts — 0 is fine if that account doesn't exist yet in your local DB).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-admin-roles.ts package.json
git commit -m "feat: add one-time admin-role seed script"
```

---

### Task 8: Frontend — propagate `role`, gate the Admin nav link

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/contexts/auth-context.tsx`
- Modify: `frontend/src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `role` on `AuthResponse`/`ProfileResponse` (Task 3), returned by `POST /auth/login`, `POST /auth/register`, `GET /auth/profile`.
- Produces: `Role` type, `AuthUser.role`, consumed by Task 9's role editor and this task's own nav gating.

- [ ] **Step 1: Update `frontend/src/types/index.ts`**

Add the `Role` type and update `AuthUser`/`AdminUserSummary`:

```typescript
export type Role = 'user' | 'admin'

export interface EventItem {
  eventId: string
  userId: string
  title: string
  description: string
  date: string
  createdAt: string
  updatedAt: string
  isFollowing?: boolean
}

export interface AuthUser {
  userId: string
  email: string
  name: string
  role: Role
}

export interface AuthResponse extends AuthUser {
  accessToken: string
}

export interface NotificationLogEntry {
  id: string
  userId: string
  eventId: string | null
  title: string
  body: string
  status: string
  error: string | null
  createdAt: string
}

export interface AdminUserSummary {
  userId: string
  email: string
  name: string
  role: Role
  createdAt: string
}

export interface PaginatedAdminUsers {
  items: AdminUserSummary[]
  total: number
  page: number
  pageSize: number
}
```

- [ ] **Step 2: Update `frontend/src/contexts/auth-context.tsx`**

`StoredSession extends AuthUser` already picks up `role` automatically since `AuthUser` now has it — only `setSession` and the `user` object need to actually copy it through:

```typescript
      user: session ? { userId: session.userId, email: session.email, name: session.name, role: session.role } : null,
      setSession: (data: AuthResponse) => {
        const next: StoredSession = {
          token: data.accessToken,
          userId: data.userId,
          email: data.email,
          name: data.name,
          role: data.role,
        }
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
        setSessionState(next)
      },
```

- [ ] **Step 3: Gate the Admin nav link in `frontend/src/components/layout/app-sidebar.tsx`**

Read the file first to see the exact surrounding JSX (the "Administration" section starts at line 70 per earlier exploration), then wrap that `SidebarGroup`/section in a check on `user?.role === 'admin'`, pulling `user` from `useAuth()` at the top of the component (mirror however `app-header.tsx` already imports `useAuth` — `import { useAuth } from '@/contexts/auth-context'`). Do not remove the underlying gateway-side `AdminGuard` check — this is a UX nicety (don't show a link that 403s), not a security boundary.

- [ ] **Step 4: Typecheck and manually verify**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck -p .`
Expected: no new errors.

Start the app (`npm run dev` in `frontend/`, plus the backend services), log in as a non-admin account, and confirm the "Administration" nav section is gone. Log in as the seeded admin account (Task 7), confirm it's visible and the admin console still loads.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/contexts/auth-context.tsx frontend/src/components/layout/app-sidebar.tsx
git commit -m "feat(frontend): propagate role, hide admin nav link for non-admins"
```

---

### Task 9: Frontend — role badge + role editor in Users panel

**Files:**
- Modify: `frontend/src/features/admin/api.ts`
- Modify: `frontend/src/features/admin/hooks.ts`
- Modify: `frontend/src/features/admin/components/users-panel.tsx`

**Interfaces:**
- Consumes: `PATCH /admin/users/:userId/role` (Task 6), `Role` type (Task 8).
- Produces: `updateUserRole(userId, role, token)` in `api.ts`, `useUpdateUserRole()` in `hooks.ts` — both reused unchanged by Task 14.

- [ ] **Step 1: Add `updateUserRole` to `frontend/src/features/admin/api.ts`**

```typescript
import { api } from '@/services/http/client'
import type { AdminUserSummary, NotificationLogEntry, Role } from '@/types'

export function listUsers(token: string | null) {
  return api<AdminUserSummary[]>('GET', '/admin/users', undefined, { token })
}

export function updateUserRole(userId: string, role: Role, token: string | null) {
  return api<AdminUserSummary>('PATCH', `/admin/users/${userId}/role`, { role }, { token })
}

export function deleteUser(userId: string, token: string | null) {
  return api<void>('DELETE', `/admin/users/${userId}`, undefined, { token })
}

export function listAllNotifications(token: string | null) {
  return api<NotificationLogEntry[]>('GET', '/admin/notifications', undefined, { token })
}
```

(This still calls `listUsers` with no params — Task 12 changes its signature and return type. Keeping this task scoped to the role editor only.)

- [ ] **Step 2: Add `useUpdateUserRole` to `frontend/src/features/admin/hooks.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as adminApi from '@/features/admin/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'
import type { Role } from '@/types'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useAdminUsers() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers(token),
    enabled: isAuthenticated,
  })
}

export function useDeleteAdminUser() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId, token),
    onSuccess: () => {
      toast.success('User deleted')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e) => toast.error('Could not delete user', { description: errorMessage(e) }),
  })
}

export function useUpdateUserRole() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      adminApi.updateUserRole(userId, role, token),
    onSuccess: () => {
      toast.success('Role updated')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e) => toast.error('Could not update role', { description: errorMessage(e) }),
  })
}

export function useAdminNotifications() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => adminApi.listAllNotifications(token),
    enabled: isAuthenticated,
  })
}
```

- [ ] **Step 3: Add a role column to `frontend/src/features/admin/components/users-panel.tsx`**

Replace the whole file with:

```tsx
import { Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useAdminUsers, useDeleteAdminUser, useUpdateUserRole } from '@/features/admin/hooks'
import type { Role } from '@/types'

export function UsersPanel() {
  const users = useAdminUsers()
  const deleteUser = useDeleteAdminUser()
  const updateRole = useUpdateUserRole()

  if (users.isLoading) return <Skeleton className="h-64" />

  if ((users.data ?? []).length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No users found</EmptyTitle>
          <EmptyDescription>Either there are no accounts yet, or you don&apos;t have admin access.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(users.data ?? []).map((u) => {
          const isDeleting = deleteUser.isPending && deleteUser.variables === u.userId
          const isChangingRole = updateRole.isPending && updateRole.variables?.userId === u.userId
          return (
            <TableRow key={u.userId}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Select
                  value={u.role}
                  disabled={isChangingRole}
                  onValueChange={(v) => updateRole.mutate({ userId: u.userId, role: v as Role })}
                >
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" disabled={isDeleting}>
                      {isDeleting ? <Spinner /> : <Trash2Icon />}
                    </Button>
                  }
                  title="Delete this user?"
                  description={`This permanently deletes ${u.email} and their sessions. This cannot be undone.`}
                  onConfirm={() => deleteUser.mutate(u.userId)}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck -p .`
Expected: no errors.

- [ ] **Step 5: Manually verify**

With both backend and frontend dev servers running, open the admin Users panel, change a user's role via the dropdown, confirm a "Role updated" toast appears and the row reflects the new value after refetch.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/admin/api.ts frontend/src/features/admin/hooks.ts frontend/src/features/admin/components/users-panel.tsx
git commit -m "feat(frontend): add role editor to admin users panel"
```

---

### Task 10: Auth service — real search/filter/sort/pagination

**Files:**
- Modify: `apps/auth/src/auth.service.ts`
- Modify: `apps/auth/src/auth.service.spec.ts`

**Interfaces:**
- Consumes: `ListUsersQueryDto` (Task 2), Prisma `Prisma.UserWhereInput` (generated, Task 1).
- Produces: `AuthService.findAll` returns real `PaginatedUsers` honoring `page`/`pageSize`/`search`/`role`/`createdFrom`/`createdTo`/`sortBy`/`sortOrder` — consumed by the gateway in Task 11.

- [ ] **Step 1: Write the failing tests**

Append to `apps/auth/src/auth.service.spec.ts`:

```typescript
  describe('findAll', () => {
    const dbUser = {
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'user' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('applies defaults when no query params are given', async () => {
      prisma.user.findMany.mockResolvedValue([dbUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            userId: 'u1',
            email: 'a@example.com',
            name: 'A',
            role: 'user',
            createdAt: dbUser.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('builds search, role, and date-range filters, custom sort and pagination', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({
        page: 3,
        pageSize: 50,
        search: 'ali',
        role: 'admin',
        createdFrom: '2026-01-01',
        createdTo: '2026-06-30',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'ali', mode: 'insensitive' } },
            { email: { contains: 'ali', mode: 'insensitive' } },
          ],
          role: 'admin',
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-06-30T23:59:59.999Z'),
          },
        },
        orderBy: { name: 'asc' },
        skip: 100,
        take: 50,
      });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: FAIL — the current `findAll` ignores `query` entirely and always calls `findMany({ orderBy: { createdAt: 'desc' } })` with no `where`/`skip`/`take`, and never calls `prisma.user.count`.

- [ ] **Step 3: Replace `findAll` in `apps/auth/src/auth.service.ts`**

First, uncomment/re-add the `Prisma` import (removed as unused in Task 3's note):

```typescript
import { Prisma } from './generated/prisma-client';
```

Then replace the `findAll` method body:

```typescript
  async findAll(query: ListUsersQueryDto = {}): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo
          ? { lte: new Date(`${query.createdTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest apps/auth/src/auth.service.spec.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/auth/src/auth.service.ts apps/auth/src/auth.service.spec.ts
git commit -m "feat(auth): implement search/filter/sort/pagination in findAll"
```

---

### Task 11: Gateway — query params for `GET /admin/users`

**Files:**
- Modify: `apps/api-gateway/src/dto/auth.dto.ts`
- Modify: `apps/api-gateway/src/api-gateway.controller.ts`
- Modify: `apps/api-gateway/src/api-gateway.service.ts`

**Interfaces:**
- Consumes: `ListUsersQuerySchema`/`ListUsersQueryDto` (Task 2), `AuthService.findAll` (Task 10).
- Produces: `GET /admin/users?page=&pageSize=&search=&role=&createdFrom=&createdTo=&sortBy=&sortOrder=` returning `PaginatedUsers` — consumed by the frontend in Task 12.

- [ ] **Step 1: Add the query DTO class in `apps/api-gateway/src/dto/auth.dto.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import {
  RegisterSchema,
  LoginSchema,
  UpdateUserRoleSchema,
  ListUsersQuerySchema,
} from '@app/shared';

export class RegisterBodyDto extends createZodDto(RegisterSchema) {}
export class LoginBodyDto extends createZodDto(LoginSchema) {}
export class UpdateUserRoleBodyDto extends createZodDto(UpdateUserRoleSchema) {}
export class ListUsersQueryBodyDto extends createZodDto(ListUsersQuerySchema) {}
```

- [ ] **Step 2: Update `listUsers` in `apps/api-gateway/src/api-gateway.controller.ts`**

Add `Query` to the `@nestjs/common` import, `ApiQuery` to the `@nestjs/swagger` import, `ListUsersQueryBodyDto` to the dto import, and the pipe import:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
```

```typescript
import { ListUsersQuerySchema } from '@app/shared';
import { RegisterBodyDto, LoginBodyDto, UpdateUserRoleBodyDto, ListUsersQueryBodyDto } from './dto/auth.dto';
```

Replace the `listUsers` route:

```typescript
  @ApiTags('Admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'List users (admin only), paginated/searchable/filterable/sortable' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: ['user', 'admin'] })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'email', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Users returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @UseGuards(AdminGuard)
  @Get('admin/users')
  listUsers(
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQueryBodyDto,
  ) {
    return this.apiGatewayService.listUsers(query);
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/api-gateway/tsconfig.app.json` (or the correct tsconfig path per Task 6 Step 4's note)
Expected: no errors. (`api-gateway.service.ts`'s `listUsers(query: ListUsersQueryDto = {})` from Task 6 already accepts this shape unchanged — no edit needed there.)

- [ ] **Step 4: Start the stack and manually verify with curl**

With the dev stack running (`docker compose -f docker-compose.dev.yml up -d`, or your usual local run command), log in to get a token, then:

Run: `curl -s "http://localhost:3000/admin/users?page=1&pageSize=5&sortBy=name&sortOrder=asc" -H "Authorization: Bearer <token>"`
Expected: JSON body shaped like `{ "items": [...], "total": <n>, "page": 1, "pageSize": 5 }`, with `items` sorted by name ascending and at most 5 entries. (Adjust the port/host if your gateway binds elsewhere — check `apps/api-gateway`'s `main.ts` or `.env`'s `PORT`/`API_GATEWAY_PORT` for the actual value.)

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/dto/auth.dto.ts apps/api-gateway/src/api-gateway.controller.ts
git commit -m "feat(gateway): accept pagination/search/filter/sort query params on GET /admin/users"
```

---

### Task 12: Frontend — paginated `listUsers` API + hook

**Files:**
- Modify: `frontend/src/features/admin/api.ts`
- Modify: `frontend/src/features/admin/hooks.ts`

**Interfaces:**
- Consumes: `GET /admin/users?...` returning `PaginatedAdminUsers` (Task 11, Task 8's type).
- Produces: `ListUsersParams` type, `listUsers(token, params)`, `useAdminUsers(params)` — consumed by Task 14's rewritten panel.

- [ ] **Step 1: Rewrite `listUsers` in `frontend/src/features/admin/api.ts`**

```typescript
import { api } from '@/services/http/client'
import type { AdminUserSummary, PaginatedAdminUsers, NotificationLogEntry, Role } from '@/types'

export interface ListUsersParams {
  page?: number
  pageSize?: number
  search?: string
  role?: Role
  createdFrom?: string
  createdTo?: string
  sortBy?: 'name' | 'email' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

function buildQuery(params: ListUsersParams): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export function listUsers(token: string | null, params: ListUsersParams = {}) {
  return api<PaginatedAdminUsers>('GET', `/admin/users${buildQuery(params)}`, undefined, { token })
}

export function updateUserRole(userId: string, role: Role, token: string | null) {
  return api<AdminUserSummary>('PATCH', `/admin/users/${userId}/role`, { role }, { token })
}

export function deleteUser(userId: string, token: string | null) {
  return api<void>('DELETE', `/admin/users/${userId}`, undefined, { token })
}

export function listAllNotifications(token: string | null) {
  return api<NotificationLogEntry[]>('GET', '/admin/notifications', undefined, { token })
}
```

- [ ] **Step 2: Update `useAdminUsers` in `frontend/src/features/admin/hooks.ts`**

```typescript
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as adminApi from '@/features/admin/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'
import type { Role } from '@/types'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useAdminUsers(params: adminApi.ListUsersParams) {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminApi.listUsers(token, params),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  })
}
```

(Leave `useDeleteAdminUser`, `useUpdateUserRole`, and `useAdminNotifications` as-is — `invalidateQueries({ queryKey: ['admin', 'users'] })` still matches every `['admin', 'users', params]` query by prefix, so no change needed there.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck -p .`
Expected: errors in `users-panel.tsx` calling `useAdminUsers()` with no arguments — expected at this point, fixed in Task 14. No errors anywhere else.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/api.ts frontend/src/features/admin/hooks.ts
git commit -m "feat(frontend): paginated/filterable listUsers API and hook"
```

---

### Task 13: Frontend — debounce hook

**Files:**
- Create: `frontend/src/hooks/use-debounced-value.ts`

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T` — consumed by Task 14's search input.

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck -p .`
Expected: same state as Task 12 Step 3 (no new errors from this file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-debounced-value.ts
git commit -m "feat(frontend): add useDebouncedValue hook"
```

---

### Task 14: Frontend — rewrite Users panel with search, filters, sortable headers, pagination

**Files:**
- Rewrite: `frontend/src/features/admin/components/users-panel.tsx`

**Interfaces:**
- Consumes: `useAdminUsers(params)` (Task 12), `useDeleteAdminUser`/`useUpdateUserRole` (Task 9), `useDebouncedValue` (Task 13).

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useAdminUsers, useDeleteAdminUser, useUpdateUserRole } from '@/features/admin/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { Role } from '@/types'

type SortField = 'name' | 'email' | 'createdAt'
type SortOrder = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string
  field: SortField
  sortBy: SortField
  sortOrder: SortOrder
  onSort: (field: SortField) => void
}) {
  const isActive = sortBy === field
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {isActive &&
          (sortOrder === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          ))}
      </button>
    </TableHead>
  )
}

export function UsersPanel() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const search = useDebouncedValue(searchInput, 300)

  useEffect(() => {
    setPage(1)
  }, [search, role, createdFrom, createdTo])

  const users = useAdminUsers({
    page,
    pageSize,
    search: search || undefined,
    role: role === 'all' ? undefined : role,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sortBy,
    sortOrder,
  })
  const deleteUser = useDeleteAdminUser()
  const updateRole = useUpdateUserRole()

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (users.isLoading) return <Skeleton className="h-64" />

  const items = users.data?.items ?? []
  const total = users.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(search || role !== 'all' || createdFrom || createdTo)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-search" className="text-xs text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="users-search"
              placeholder="Name or email"
              className="w-56 pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Role</label>
          <Select value={role} onValueChange={(v) => setRole(v as Role | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-created-from" className="text-xs text-muted-foreground">
            Joined after
          </label>
          <Input
            id="users-created-from"
            type="date"
            className="w-40"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-created-to" className="text-xs text-muted-foreground">
            Joined before
          </label>
          <Input
            id="users-created-to"
            type="date"
            className="w-40"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              setRole('all')
              setCreatedFrom('')
              setCreatedTo('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No users found</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'No users match these filters.'
                : "Either there are no accounts yet, or you don't have admin access."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader
                label="Joined"
                field="createdAt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => {
              const isDeleting = deleteUser.isPending && deleteUser.variables === u.userId
              const isChangingRole = updateRole.isPending && updateRole.variables?.userId === u.userId
              return (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      disabled={isChangingRole}
                      onValueChange={(v) => updateRole.mutate({ userId: u.userId, role: v as Role })}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" disabled={isDeleting}>
                          {isDeleting ? <Spinner /> : <Trash2Icon />}
                        </Button>
                      }
                      title="Delete this user?"
                      description={`This permanently deletes ${u.email} and their sessions. This cannot be undone.`}
                      onConfirm={() => deleteUser.mutate(u.userId)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total === 0
            ? '0 users'
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} users`}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck -p .`
Expected: no errors anywhere in `frontend/src`.

- [ ] **Step 3: Manually verify in the browser**

With the full stack running (gateway, auth, frontend dev server) and ~enough seeded users to see pagination (the existing `scripts/seed.ts` only creates 3 — for a real 10k-scale check, temporarily bump `pageSize` down to something small like 2 to exercise pagination with few rows, or generate more seed users):

1. Open the admin Users panel — confirm it loads page 1, 20 rows (or fewer), sorted by Joined desc by default.
2. Type into Search — confirm the list narrows after a short debounce pause, and the page resets to 1.
3. Pick a Role filter — confirm the list narrows to just that role.
4. Set "Joined after"/"Joined before" — confirm the list narrows to that date range.
5. Click "Clear filters" — confirm all filters reset and the full list returns.
6. Click the "Name", "Email", and "Joined" column headers — confirm each click sorts ascending, and a second click on the same header flips to descending (arrow icon flips too).
7. Change the page-size selector — confirm the row count changes and page resets to 1.
8. With more than one page of results, click "Next"/"Previous" — confirm the row range in "X–Y of Z users" updates and rows change; confirm the same delete-spinner and role-editor behavior from Tasks 9 still works against a paginated row.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/components/users-panel.tsx
git commit -m "feat(frontend): add search/filter/sort/pagination controls to admin users panel"
```

---

## Deferred / explicitly out of scope

- **Refresh-token flow.** Shortening the JWT lifetime to 1h with no refresh endpoint means users re-authenticate hourly. The `RefreshToken` Prisma model already exists but nothing issues, rotates, or redeems refresh tokens. Worth a follow-up plan on its own.
- **`status`/banned enforcement.** Explicitly skipped per the scoping conversation — no `status` field, no login/API blocking.
- **Removing `ADMIN_EMAILS` from deployed environments** (Railway/CI config, `docker-compose.prod.yml`, etc.) — Task 5 only removes it from `.env.example`; production env vars should be cleaned up separately once the seed script (Task 7) has run against the production DB.
