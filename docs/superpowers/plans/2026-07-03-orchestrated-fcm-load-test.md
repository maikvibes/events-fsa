# Orchestrated FCM Fanout Load Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the notifications service `broadcast()` with timing + completion events, build a new orchestrator NestJS hybrid app that bridges the async pipeline back to k6 workers, and write a k6 test that seeds 100k tokens, triggers a broadcast, polls for results, and records RTT metrics.

**Architecture:** k6 poll-based orchestration: k6 registers tokens via existing API, triggers fire-and-forget broadcast, polls orchestrator HTTP endpoint until the notifications service's Kafka completion event arrives, records RTT. One new NestJS app (orchestrator, hybrid HTTP + Kafka), small modifications to shared contracts and the notifications service.

**Tech Stack:** NestJS (hybrid HTTP + Kafka microservice), Kafka (existing `@nestjs/microservices` + `kafkajs`), k6 (HTTP polling, no WebSocket dependencies).

## Global Constraints

- No new npm dependencies. Everything uses already-installed packages (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/microservices`, `kafkajs`).
- The orchestrator is a hybrid NestJS app: HTTP server for the k6 polling API, Kafka consumer for completion events. Follows the pattern: `NestFactory.create()` + `app.connectMicroservice()`.
- Test ID correlation flows through the broadcast `data` field (arbitrary key-value, already part of the `BroadcastDto` type). No new route schema needed.
- The orchestrator's in-memory `Map<string, BroadcastResult>` is acceptable for a test tool — no persistence.
- k6 uses only built-in modules (`k6/http`, `k6/execution`), no experimental modules needed.

---

## File Structure

**Shared contracts:**
- `libs/shared/src/kafka.contracts.ts` (modify) — add `NOTIFICATION_BROADCAST_COMPLETED` topic + `NotificationBroadcastCompletedEvent` interface.

**Notifications service (`apps/notifications`):**
- `apps/notifications/src/notifications.service.ts` (modify) — add timing + emit completion event in `broadcast()`.

**Orchestrator (`apps/orchestrator`):**
- `nest-cli.json` (modify) — add `orchestrator` project entry.
- `apps/orchestrator/tsconfig.app.json` (new) — build config.
- `apps/orchestrator/src/main.ts` (new) — hybrid bootstrap.
- `apps/orchestrator/src/orchestrator.module.ts` (new) — module setup.
- `apps/orchestrator/src/orchestrator.controller.ts` (new) — HTTP endpoints.
- `apps/orchestrator/src/orchestrator.service.ts` (new) — Kafka consumer + test state.

**k6:**
- `k6/08-orchestrated-fanout.test.js` (new) — seed + broadcast + poll test.

---

### Task 1: Shared contracts — add broadcast-completed event

**Files:**
- Modify: `libs/shared/src/kafka.contracts.ts`

**Interfaces:**
- Produces: `KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED`, `NotificationBroadcastCompletedEvent` — consumed by Tasks 2 and 4.

- [ ] **Step 1: Add the topic and event type**

In `libs/shared/src/kafka.contracts.ts`, add to the `KafkaTopics` enum:

```typescript
  NOTIFICATION_BROADCAST_COMPLETED = 'notification.broadcast-completed',
```

Add the event interface after the existing `NotificationBroadcastEvent`:

```typescript
// Emitted by the notifications service when a broadcast finishes processing
// all batches. The orchestrator consumes this to forward results to k6.
export interface NotificationBroadcastCompletedEvent {
  testId?: string;
  totalTokens: number;
  sent: number;
  failed: number;
  totalMs: number;
  completedAt: Date;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `libs/shared/src`. Errors from apps not yet updated are expected.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/kafka.contracts.ts
git commit -m "feat(shared): add notification.broadcast-completed event contract"
```

---

### Task 2: Notifications service — instrument broadcast() with timing and completion event

**Files:**
- Modify: `apps/notifications/src/notifications.service.ts`

**Interfaces:**
- Consumes: `KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED` (Task 1).
- Produces: `broadcast()` now emits one completion event on finish. The existing return type is unchanged.

- [ ] **Step 1: Add the import and modify `broadcast()`**

Add the import at the top of `apps/notifications/src/notifications.service.ts`:

```typescript
import {
  KafkaTopics,
  NotificationBroadcastCompletedEvent,
  // ... existing imports
} from '@app/shared';
```

Replace the `broadcast()` method (lines 208-222):

```typescript
  async broadcast(
    dto: BroadcastDto,
  ): Promise<{ sent: number; failed: number }> {
    const startTime = Date.now();
    const all = await this.prisma.deviceToken.findMany({
      select: { token: true },
    });
    const tokens = all.map((t) => t.token);
    if (!tokens.length) {
      this.logger.warn('Broadcast: no device tokens');
      return { sent: 0, failed: 0 };
    }
    const result = await this.sendMulticast({ tokens, ...dto });
    const totalMs = Date.now() - startTime;

    this.logger.log(
      `Broadcast: ${result.sent}/${tokens.length} sent in ${totalMs}ms`,
    );

    // ponytail: in-memory emit — one event is sufficient, no retry or DLQ needed for a test tool
    const completed: NotificationBroadcastCompletedEvent = {
      testId: dto.data?.testId,
      totalTokens: tokens.length,
      sent: result.sent,
      failed: result.failed,
      totalMs,
      completedAt: new Date(),
    };
    this.producer.emit(KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED, completed);

    return result;
  }
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p apps/notifications/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/notifications/src/notifications.service.ts
git commit -m "feat(notifications): emit broadcast-completed event with timing"
```

---

### Task 3: NestJS CLI — add orchestrator project

**Files:**
- Modify: `nest-cli.json`
- Create: `apps/orchestrator/tsconfig.app.json`

- [ ] **Step 1: Add project entry**

Add to the `projects` object in `nest-cli.json`:

```json
    "orchestrator": {
      "type": "application",
      "root": "apps/orchestrator",
      "entryFile": "main",
      "sourceRoot": "apps/orchestrator/src",
      "compilerOptions": {
        "tsConfigPath": "apps/orchestrator/tsconfig.app.json"
      }
    }
```

- [ ] **Step 2: Create tsconfig**

Create `apps/orchestrator/tsconfig.app.json` (mirror the notifications tsconfig):

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/orchestrator",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create directory**

```bash
mkdir -p apps/orchestrator/src
```

- [ ] **Step 4: Commit**

```bash
git add nest-cli.json apps/orchestrator/tsconfig.app.json
git commit -m "chore: add orchestrator project to nest-cli"
```

---

### Task 4: Orchestrator — NestJS hybrid app (HTTP controller + Kafka consumer)

**Files:**
- Create: `apps/orchestrator/src/main.ts`
- Create: `apps/orchestrator/src/orchestrator.module.ts`
- Create: `apps/orchestrator/src/orchestrator.controller.ts`
- Create: `apps/orchestrator/src/orchestrator.service.ts`

**Interfaces:**
- Consumes: `KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED` (Task 1).
- Produces: `POST /test/register`, `GET /test/:testId` — consumed by Task 5 (k6 script).

- [ ] **Step 1: Create `apps/orchestrator/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { OrchestratorModule } from './orchestrator.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

async function bootstrap() {
  const app = await NestFactory.create(OrchestratorModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: kafkaBaseClientOptions('orchestrator'),
      consumer: { groupId: 'orchestrator-consumer' },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.ORCHESTRATOR_PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 2: Create `apps/orchestrator/src/orchestrator.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
})
export class OrchestratorModule {}
```

- [ ] **Step 3: Create `apps/orchestrator/src/orchestrator.service.ts`**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaContext } from '@nestjs/microservices';
import {
  KafkaTopics,
  NOTIFICATIONS_KAFKA_PRODUCER,
  kafkaClientConfig,
  type NotificationBroadcastCompletedEvent,
} from '@app/shared';

// ponytail: in-memory Map — ephemeral test results, no persistence needed
interface TestState {
  registered: boolean;
  result?: NotificationBroadcastCompletedEvent;
}

@Injectable()
export class OrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly tests = new Map<string, TestState>();

  onModuleInit() {
    this.logger.log('Orchestrator started — waiting for k6 workers');
  }

  registerTest(testId: string) {
    this.tests.set(testId, { registered: true });
    this.logger.log(`Test registered: ${testId}`);
  }

  getResult(testId: string): NotificationBroadcastCompletedEvent | null {
    const state = this.tests.get(testId);
    return state?.result ?? null;
  }

  // ponytail: single Kafka consumer, no @MessagePattern decorator needed —
  // the NestJS microservice context handles topic routing in main.ts.
  // We register this via the Kafka context in a real setup, but since NestJS
  // @MessagePattern/@EventPattern decorators are per-controller, we use a
  // controller-based approach instead.

  // Actually, use a Controller with @EventPattern for cleaner NestJS integration:
  // Moved to orchestrator.controller.ts — this service just holds test state.
}
```

Wait — NestJS Kafka consumers must be decorated with `@EventPattern` or
`@MessagePattern`, which live on controllers, not services. Refactor:

The service holds state; the controller handles Kafka events.

- [ ] **Step 3 (corrected): Create `apps/orchestrator/src/orchestrator.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { NotificationBroadcastCompletedEvent } from '@app/shared';

// ponytail: in-memory Map — ephemeral test results, no persistence needed
interface TestState {
  result?: NotificationBroadcastCompletedEvent;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly tests = new Map<string, TestState>();

  registerTest(testId: string) {
    this.tests.set(testId, {});
    this.logger.log(`Test registered: ${testId}`);
  }

  getResult(testId: string): NotificationBroadcastCompletedEvent | null {
    return this.tests.get(testId)?.result ?? null;
  }

  handleCompleted(event: NotificationBroadcastCompletedEvent) {
    const testId = event.testId;
    if (testId && this.tests.has(testId)) {
      this.tests.set(testId, { result: event });
      this.logger.log(
        `Broadcast completed for ${testId}: ${event.totalTokens} tokens in ${event.totalMs}ms`,
      );
    } else {
      this.logger.debug(
        `Ignored completion for unknown testId: ${testId ?? '<none>'}`,
      );
    }
  }
}
```

- [ ] **Step 4: Create `apps/orchestrator/src/orchestrator.controller.ts`**

```typescript
import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KafkaTopics } from '@app/shared';
import type { NotificationBroadcastCompletedEvent } from '@app/shared';
import { OrchestratorService } from './orchestrator.service';

@Controller()
export class OrchestratorController {
  constructor(private readonly service: OrchestratorService) {}

  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @Post('test/register')
  @HttpCode(201)
  register(@Payload() body: { testId: string }) {
    this.service.registerTest(body.testId);
    return { registered: true, testId: body.testId };
  }

  @Get('test/:testId')
  getResult(@Param('testId') testId: string) {
    const result = this.service.getResult(testId);
    if (!result) {
      throw new NotFoundException(
        `Result not yet available for test "${testId}"`,
      );
    }
    return result;
  }

  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED)
  onBroadcastCompleted(@Payload() event: NotificationBroadcastCompletedEvent) {
    this.service.handleCompleted(event);
  }
}
```

Wait — the `POST /test/register` uses `@Payload()` which is a Kafka decorator.
For HTTP controllers, we need `@Body()`. Let me fix that:

- [ ] **Step 4 (corrected): Create `apps/orchestrator/src/orchestrator.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KafkaTopics } from '@app/shared';
import type { NotificationBroadcastCompletedEvent } from '@app/shared';
import { OrchestratorService } from './orchestrator.service';

@Controller()
export class OrchestratorController {
  constructor(private readonly service: OrchestratorService) {}

  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @Post('test/register')
  @HttpCode(201)
  register(@Body() body: { testId: string }) {
    this.service.registerTest(body.testId);
    return { registered: true, testId: body.testId };
  }

  @Get('test/:testId')
  getResult(@Param('testId') testId: string) {
    const result = this.service.getResult(testId);
    if (!result) {
      throw new NotFoundException(
        `Result not yet available for test "${testId}"`,
      );
    }
    return result;
  }

  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST_COMPLETED)
  onBroadcastCompleted(@Payload() event: NotificationBroadcastCompletedEvent) {
    this.service.handleCompleted(event);
  }
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit -p apps/orchestrator/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/
git commit -m "feat(orchestrator): hybrid NestJS app with HTTP endpoints and Kafka consumer"
```

---

### Task 5: k6 test — orchestrated fanout test

**Files:**
- Create: `k6/08-orchestrated-fanout.test.js`

**Interfaces:**
- Consumes: `POST /test/register`, `GET /test/:testId` (Task 4), `POST /notifications/register-token`, `POST /notifications/broadcast` (existing).
- Produces: k6 `Trend` metrics for fanout time and end-to-end RTT.

- [ ] **Step 1: Create the test file**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend } from 'k6/metrics';
import {
  BASE_URL,
  authHeaders,
  createUser,
  registerToken,
  REQUEST_TIMEOUT,
} from './helpers.js';

const ORCHESTRATOR_URL = __ENV.ORCHESTRATOR_URL || 'http://localhost:3001';
const TOKENS_TO_SEED = Number(__ENV.TOKENS || 100000);
const SEED_VUS = Number(__ENV.SEED_VUS || 500);
const TOKENS_PER_VU = Math.ceil(TOKENS_TO_SEED / SEED_VUS);
const USER_POOL = Number(__ENV.USER_POOL || 100);

const fanoutPipelineMs = new Trend('fanout_pipeline_ms', true);
const fanoutEndToEndMs = new Trend('fanout_end_to_end_ms', true);
const fanoutTokensPerSec = new Trend('fanout_tokens_per_sec', true);

function deviceToken(i) {
  return `fake-token-fanout-${String(i).padStart(6, '0')}`;
}

function testId() {
  return `fanout-${Date.now()}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
}

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: TOKENS_TO_SEED,
      maxDuration: '10m',
      exec: 'seedScenario',
    },
    fanout: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5m',
      startTime: '10m',
      exec: 'fanoutScenario',
    },
  },
  thresholds: {
    fanout_pipeline_ms: ['p(95)<120000'],  // pipeline under 2 min
  },
};

export function setup() {
  const users = [];
  for (let i = 0; i < USER_POOL; i++) {
    users.push(createUser(`fanout-${i}`));
  }
  return { users };
}

export function seedScenario(data) {
  const i = exec.scenario.iterationInTest;
  const user = data.users[i % data.users.length];
  const token = deviceToken(i);

  const res = registerToken(user.token, user.userId, token, 'web');
  check(res, { 'seed: token registered': (r) => r.status === 201 });
}

export function fanoutScenario(data) {
  const admin = createUser('admin-fanout');
  const id = testId();

  // Register the test with the orchestrator
  const regRes = http.post(
    `${ORCHESTRATOR_URL}/test/register`,
    JSON.stringify({ testId: id }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(regRes, { 'orchestrator: test registered': (r) => r.status === 201 });

  const triggerTime = Date.now();

  // Trigger the broadcast (fire-and-forget, 202)
  const broadcastRes = http.post(
    `${BASE_URL}/notifications/broadcast`,
    JSON.stringify({
      title: 'Fanout Test',
      body: `Orchestrated load test — ${id}`,
      data: { testId: id },
    }),
    { headers: authHeaders(admin.token), timeout: REQUEST_TIMEOUT },
  );
  check(broadcastRes, {
    'broadcast: accepted 202': (r) => r.status === 202,
  });

  // Poll the orchestrator for the result
  const pollStart = Date.now();
  let completed = null;
  const maxWaitMs = 180_000; // 3 minutes max

  while (Date.now() - pollStart < maxWaitMs) {
    const pollRes = http.get(`${ORCHESTRATOR_URL}/test/${id}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (pollRes.status === 200) {
      completed = pollRes.json();
      break;
    }

    sleep(1);
  }

  check(completed, { 'fanout: result received': (r) => r !== null });

  if (completed) {
    const endToEndRtt = Date.now() - triggerTime;
    fanoutPipelineMs.add(completed.totalMs);
    fanoutEndToEndMs.add(endToEndRtt);
    fanoutTokensPerSec.add(completed.totalTokens / (completed.totalMs / 1000));
  }
}
```

- [ ] **Step 2: Add npm script**

Add to root `package.json` scripts:

```json
"k6:fanout": "k6 run k6/08-orchestrated-fanout.test.js --env TOKENS=1000",
"k6:fanout:full": "k6 run k6/08-orchestrated-fanout.test.js --env TOKENS=100000"
```

Use `k6:fanout` for quick local validation (1000 tokens), `k6:fanout:full` for the 100k run.

- [ ] **Step 3: Commit**

```bash
git add k6/08-orchestrated-fanout.test.js package.json
git commit -m "feat(k6): add orchestrated fanout load test"
```

---

### Task 6: Docker compose — add orchestrator service

**Files:**
- Modify: `docker-compose.dev.yml`

- [ ] **Step 1: Add the service**

Add alongside the other app services in `docker-compose.dev.yml`:

```yaml
  orchestrator:
    build:
      context: .
      target: runner
    command: node dist/apps/orchestrator/main.js
    environment:
      KAFKA_BROKER: kafka:29092
      ORCHESTRATOR_PORT: '3001'
    ports:
      - '3001:3001'
    depends_on:
      - kafka
    networks:
      - app-network
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.dev.yml
git commit -m "chore: add orchestrator to docker-compose.dev.yml"
```

---

## Deferred / explicitly out of scope

- **WebSocket.** HTTP polling is sufficient — broadcast times are 30-120s, so 1s polling adds negligible error. No new dependencies.
- **Per-batch streaming events.** One completion event covers all use cases. Per-batch granularity doesn't improve the measurement.
- **Real FCM delivery measurement.** Not possible without browser/device fleet. This test measures the pipeline: HTTP → Kafka → notifications service → FCM SDK.
- **Redis cache for token list.** Not needed for the test — the DB query is part of what we're measuring.
- **`@nestjs/schedule` / cron.** Not part of this scope.
- **Seed script.** k6's existing `createUser()` + `registerToken()` helpers already seed tokens in the seed scenario.
