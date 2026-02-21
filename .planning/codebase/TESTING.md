# Testing Patterns

**Analysis Date:** 2026-02-21

## Test Framework

**Runner:**

- Vitest 3.x — used across `packages/app`, `packages/server`, `packages/relay`
- Config: `packages/app/vitest.config.ts`, `packages/server/vitest.config.ts`
- No Jest; no `jest.config.*`

**Assertion Library:**

- Vitest built-in (`expect`, matchers from vitest)

**E2E (App UI):**

- Playwright 1.56.x — Chromium-only currently
- Config: `packages/app/playwright.config.ts`
- Global setup: `packages/app/e2e/global-setup.ts`

**E2E (CLI):**

- Custom zx-based scripts in `packages/cli/tests/` (numbered phases 01–22)
- Runner: `packages/cli/tests/run-all.ts` via `npm run test:e2e`
- True E2E tests in `packages/cli/tests/e2e/` using `tsx` directly

**Run Commands:**

```bash
# Unit tests (per-package)
npm run test --workspace=@getpaseo/app        # vitest run
npm run test --workspace=@getpaseo/server     # vitest run
npm run test --workspace=@getpaseo/relay      # vitest run

# All unit tests (root)
npm run test

# Watch mode
npm run test:watch --workspace=@getpaseo/app

# Vitest UI
npm run test:ui --workspace=@getpaseo/app

# E2E (Playwright - app)
npm run test:e2e --workspace=@getpaseo/app

# E2E with UI
npm run test:e2e:ui --workspace=@getpaseo/app

# E2E (CLI scripts)
npm run test:e2e --workspace=@getpaseo/cli
```

## Test File Organization

**Location:**

- Unit tests: co-located with source files (same directory)
- E2E tests: separate `e2e/` directory at package root

**Naming:**

- Unit: `{module-name}.test.ts` (e.g., `agent-attention.test.ts`, `panel-store.test.ts`)
- Playwright E2E: `{feature}.spec.ts` (e.g., `agent-details-sheet.spec.ts`)
- CLI E2E scripts: `{NN}-{feature}.test.ts` (numbered phases for ordered execution)
- Server integration: `{module}.e2e.test.ts` for tests requiring real file system/git

**Structure:**

```
packages/app/
├── src/
│   ├── utils/
│   │   ├── agent-attention.ts
│   │   ├── agent-attention.test.ts     ← co-located
│   ├── stores/
│   │   ├── panel-store.ts
│   │   ├── panel-store.test.ts         ← co-located
│   └── runtime/
│       ├── host-runtime.ts
│       └── host-runtime.test.ts        ← co-located
└── e2e/
    ├── fixtures/                        ← test data files
    ├── helpers/
    │   ├── app.ts                       ← page helper functions
    │   └── workspace.ts                 ← temp git repo helpers
    ├── global-setup.ts                  ← start metro + daemon
    └── agent-details-sheet.spec.ts      ← test specs

packages/server/
├── src/
│   ├── server/
│   │   ├── messages.ts
│   │   ├── messages.test.ts            ← co-located
│   │   └── daemon-e2e/                 ← integration tests with real daemon
│   └── test-utils/
│       ├── vitest-setup.ts             ← global setup (env vars, dotenv)
│       └── test-logger.ts              ← silent pino logger for tests

packages/cli/
└── tests/
    ├── 01-foundation.test.ts           ← numbered zx CLI scripts
    ├── e2e/                            ← longer lifecycle tests
    └── helpers/                        ← shared test daemon setup
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, it } from 'vitest'
import { myFunction } from './my-module'

describe('myFunction', () => {
  it('returns true when condition A is met', () => {
    expect(myFunction({ input: 'valid' })).toBe(true)
  })

  it('returns false when condition B is missing', () => {
    expect(myFunction({ input: null })).toBe(false)
  })
})
```

**Nested describes for grouped cases:**

```typescript
describe("FileTaskStore", () => {
  describe("create", () => {
    it("creates a task with default status open", async () => { ... });
    it("throws when creating task with non-existent parent", async () => { ... });
  });

  describe("update", () => {
    it("updates status", async () => { ... });
  });
});
```

**Lifecycle patterns:**

```typescript
describe('FileTaskStore', () => {
  let tempDir: string
  let store: FileTaskStore

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'task-store-test-'))
    store = new FileTaskStore(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })
})
```

**Alternative — track in array, clean in afterEach (when individual tracking needed):**

```typescript
// packages/server/src/terminal/terminal.test.ts
const sessions: TerminalSession[] = []
afterEach(async () => {
  for (const session of sessions) session.kill()
  sessions.length = 0
})
function trackSession(s: TerminalSession) {
  sessions.push(s)
  return s
}
```

## Mocking

**Framework:** Vitest built-in `vi` (no separate mock library)

**Spy on console/globals:**

```typescript
import { vi } from 'vitest'

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
try {
  // ... test code
  expect(infoSpy.mock.calls.filter((call) => call[0] === '[prefix]')).toHaveLength(1)
} finally {
  infoSpy.mockRestore() // always restore in finally block
}
```

**vi.fn() for callbacks and injected dependencies:**

```typescript
const onCommitted = vi.fn()
const checkoutCommit = vi.fn(() => deferred.promise)
expect(onCommitted).toHaveBeenCalledWith(expectedArg)
```

**Module-level mocking (used for react-native Platform):**

```typescript
vi.resetModules()
vi.doMock('react-native', () => ({ Platform: { OS: 'web' } }))
const module = await import('./os-notifications')
// ... test
vi.doUnmock('react-native')
vi.restoreAllMocks()
vi.resetModules()
```

**Fake Timers:**

```typescript
vi.useFakeTimers()
pump.append({ terminalId: 'term-1', text: 'a' })
expect(chunks).toEqual([]) // not flushed yet
vi.runOnlyPendingTimers()
expect(chunks).toEqual([{ sequence: 1, text: 'a' }])
vi.useRealTimers() // always restore at end of test
```

**Preference: Fake Classes over vi.mock():**
The dominant pattern is hand-rolled fake/stub classes that implement an interface:

```typescript
// packages/app/src/runtime/host-runtime.test.ts
class FakeDaemonClient {
  public connectCalls = 0;
  public closeCalls = 0;
  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.setConnectionState({ status: "connected" });
  }
  async close(): Promise<void> { ... }
  // Public call counters for assertions
}
```

This approach is used for: `FakeDaemonClient`, `FakeTerminalStreamClient`, `MockNotification`

**Dependency Injection for testability:**
Classes accept a `deps` parameter with interfaces the tests can provide:

```typescript
// Production:
const controller = new HostRuntimeController({ host, deps: realDeps })

// Test:
const controller = new HostRuntimeController({
  host,
  deps: {
    createClient: () => fakeClient as unknown as DaemonClient,
    measureLatency: async () => 10,
    getClientSessionKey: async () => 'clsk_test',
  },
})
```

**Deferred Promises for concurrency tests:**

```typescript
function createDeferred<T>() {
  let resolve: ((v: T | PromiseLike<T>) => void) | null = null
  let reject: ((r?: unknown) => void) | null = null
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve: (v) => resolve?.(v), reject: (r) => reject?.(r) }
}

const gate = createDeferred<void>()
// ... set up slow operation waiting on gate.promise
gate.resolve()
await Promise.allSettled([slowOp, fastOp])
```

**What to Mock:**

- External processes (daemon clients, file system when testing logic not I/O)
- Browser globals that don't exist in Node (`Notification`, `CustomEvent`)
- Time-sensitive operations with `vi.useFakeTimers()`
- Network/latency operations in unit tests

**What NOT to Mock:**

- Authentication (per AGENTS.md: "Do not add auth checks to tests")
- The actual business logic being tested (use real implementations)
- File system when testing file I/O behavior (use real temp dirs)

## Fixtures and Factories

**Test Data Factory Pattern:**

```typescript
// Factory functions with sensible defaults + override via Partial<T>
function makeHost(input?: Partial<HostProfile>): HostProfile {
  const direct: HostConnection = {
    id: 'direct:lan:6767',
    type: 'direct',
    endpoint: 'lan:6767',
  }
  return {
    serverId: input?.serverId ?? 'srv_test',
    label: input?.label ?? 'test host',
    connections: input?.connections ?? [direct],
    preferredConnectionId: input?.preferredConnectionId ?? direct.id,
    createdAt: input?.createdAt ?? new Date(0).toISOString(),
    updatedAt: input?.updatedAt ?? new Date(0).toISOString(),
  }
}
```

**Temp Directory Pattern (for real file system tests):**

```typescript
let tempDir: string
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'feature-test-'))
})
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})
```

**E2E Fixtures (CLI daemon tests):**

- Random port: `10000 + Math.floor(Math.random() * 50000)` (never 6767)
- Isolated `PASEO_HOME` temp dir per test
- Isolated `workDir` temp dir per test
- Helper in `packages/cli/tests/helpers/` for `createTestContextWithDaemon()`

**E2E Fixtures (Playwright):**

- `createTempGitRepo()` from `packages/app/e2e/helpers/workspace.ts`
- Always use `try/finally` to clean up:
  ```typescript
  const repo = await createTempGitRepo()
  try {
    // test code
  } finally {
    await repo.cleanup()
  }
  ```
- `E2E_DAEMON_PORT` and `E2E_SERVER_ID` set by `global-setup.ts`
- `getByTestId()` used for all UI element selection (kebab-case testId strings)

**Location:**

- Unit fixtures: inline within test files (no separate fixture files)
- E2E audio fixtures: `packages/app/e2e/fixtures/` (`.wav`, `.webm` files)

## Coverage

**Requirements:** None enforced — no coverage thresholds configured in vitest configs

**View Coverage:**

```bash
# Not configured; add --coverage flag manually if needed
npx vitest run --coverage --workspace=packages/app
```

## Test Types

**Unit Tests:**

- Scope: Pure functions, classes with injected dependencies, state transformations
- Location: Co-located with source (`*.test.ts`)
- Speed: Fast, no I/O, no network
- Examples: `agent-attention.test.ts`, `panel-store.test.ts`, `crypto.test.ts`

**Integration Tests:**

- Scope: Real file system, real git operations, real terminal processes
- Naming: `*.e2e.test.ts` or plain `*.test.ts` in server when using temp dirs
- Examples: `terminal.test.ts` (spawns real pty), `worktree-bootstrap.test.ts` (real git)
- Timeout: Server vitest sets `testTimeout: 30000`, `hookTimeout: 60000`

**E2E Tests (Playwright):**

- Scope: Full app UI running in Metro web (Chromium)
- Location: `packages/app/e2e/*.spec.ts`
- Uses: `page.getByTestId()`, app helper functions, real daemon started by `global-setup.ts`
- Timeout: `60_000` default, `120_000` for long operations
- Parallel: `fullyParallel: true`; CI retries: 1

**E2E Tests (CLI):**

- Scope: Real daemon process, real CLI commands, real agent creation
- Location: `packages/cli/tests/e2e/`
- Uses: `zx` / `tsx` scripts, isolated daemon on random port

## Common Patterns

**Async Testing:**

```typescript
it('resolves to expected value', async () => {
  const result = await store.create('My task')
  expect(result.id).toMatch(/^[a-f0-9]{8}$/)
})
```

**Error Testing:**

```typescript
it('throws when creating task with non-existent parent', async () => {
  await expect(store.create('Child', { parentId: 'nonexistent' })).rejects.toThrow(
    'Parent task not found'
  )
})
```

**Polling / Waiting (integration tests):**

```typescript
const timeoutAt = Date.now() + 200
while (fakeClient.fetchAgentsCalls.length === 0 && Date.now() < timeoutAt) {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
expect(fakeClient.fetchAgentsCalls).toHaveLength(1)
```

**Snapshot subscription testing:**

```typescript
const observed: Snapshot[] = []
const unsubscribe = controller.subscribe(() => {
  observed.push(controller.getSnapshot())
})
// ... trigger events
const latest = observed[observed.length - 1]
expect(latest?.connectionStatus).toBe('error')
unsubscribe()
```

**Server globals config (vitest-setup.ts):**

```typescript
// packages/server/src/test-utils/vitest-setup.ts
dotenv.config({ path: '.env.test', override: true })
dotenv.config({ path: '../.env' })
process.env.GIT_TERMINAL_PROMPT = '0'
process.env.GIT_SSH_COMMAND = 'ssh -oBatchMode=yes'
```

---

_Testing analysis: 2026-02-21_
