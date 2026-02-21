# Coding Conventions

**Analysis Date:** 2026-02-21

## Naming Patterns

**Files:**

- kebab-case for all source files: `panel-store.ts`, `agent-attention.ts`, `host-runtime.ts`
- kebab-case for components: `button.tsx`, `agent-input-area.tsx`, `back-header.tsx`
- Hooks always prefixed `use-`: `use-archive-agent.ts`, `use-agent-form-state.ts`
- Stores always suffixed `-store`: `panel-store.ts`, `session-store.ts`, `draft-store.ts`
- Platform-specific variants use dot notation: `use-audio-player.native.ts`, `use-audio-player.web.ts`
- Platform type declarations use `.d.ts`: `use-audio-player.d.ts` (re-exports `.native` as default)
- Test files co-located with source: `agent-attention.ts` + `agent-attention.test.ts`
- E2E/Playwright spec files in `e2e/` directory with `.spec.ts`
- Server files use `.js` extensions in imports for ESM compatibility

**Functions:**

- camelCase for all functions: `shouldClearAgentAttentionOnView`, `clampNumber`, `resolveExplorerTabFromActiveCheckout`
- Boolean functions prefixed `is`, `has`, `should`, `can`: `isExplorerTab`, `hasEverLoadedAgentDirectory`
- Factory functions prefixed `create` or `make` (in tests): `createTestContext`, `makeHost`
- Helper functions prefixed `build`, `resolve`, `derive`: `buildExplorerCheckoutKey`, `resolveLogConfig`, `deriveBranchLabel`
- Handlers prefixed `on`: `onSelectedOutputChunk`, `onTerminalStreamData`

**Variables:**

- camelCase: `agentId`, `serverId`, `explorerTab`, `activeConnectionId`
- SCREAMING_SNAKE_CASE for constants: `DEFAULT_EXPLORER_SIDEBAR_WIDTH`, `MIN_EXPLORER_SIDEBAR_WIDTH`
- Boolean variables: `isConnected`, `hasEverLoadedAgentDirectory`, `willOpenMobile`

**Types and Interfaces:**

- PascalCase for types and interfaces: `HostProfile`, `PanelState`, `AgentScreenMissingState`
- Discriminated unions use string `kind`/`tag`/`status`/`type` field:
  ```typescript
  export type AgentScreenMissingState =
    | { kind: 'idle' }
    | { kind: 'resolving' }
    | { kind: 'not_found'; message: string }
    | { kind: 'error'; message: string }
  ```
- Input types for function params: `ShouldClearAgentAttentionOnViewInput`, `SetAgentArchivingInput`
- `type` for union types and object shapes; `interface` for extensible objects
- Type aliases re-exported via `export type` (no default type exports)

## Code Style

**Formatting (Prettier):**

- No semicolons: `semi: false`
- Single quotes: `singleQuote: true`
- Trailing commas where valid in ES5: `trailingComma: 'es5'`
- 2-space indent: `tabWidth: 2`
- 100-char line width: `printWidth: 100`

**TypeScript Strictness:**

- `strict: true` everywhere
- App/CLI: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`
- Target ES2020 with ESNext modules (bundler resolution for app, NodeNext for CLI/server)
- `isolatedModules: true` in base config

## Import Organization

**Order (by convention in codebase):**

1. External dependencies (`react`, `react-native`, `expo-*`, `@tanstack/react-query`)
2. Internal package aliases (`@server/*` for server types, `@/*` for app src)
3. Relative imports (`./`, `../`)

**Path Aliases:**

- `@/*` → `packages/app/src/*`
- `@server/*` → `packages/server/src/*` (used in app package to import server types)

**Server Imports:**

- Must use `.js` extension in import paths even for `.ts` source files (ESM NodeNext requirement):
  ```typescript
  import type { PersistedConfig } from './persisted-config.js'
  import { toAgentPayload } from './agent/agent-projections.js'
  ```

**App/Client Imports:**

- No `.js` extension needed (bundler resolution):
  ```typescript
  import { usePanelStore } from '@/stores/panel-store'
  import { shouldClearAgentAttentionOnView } from './agent-attention'
  ```

## Error Handling

**Patterns:**

- `Error` subclasses not used; plain `new Error("message")` with descriptive messages
- `assertUnreachable(value: never)` in `packages/app/src/utils/exhaustive.ts` for exhaustive switches
- Unknown errors stringified with helper: `stringifyUnknownError(error: unknown): string`
- Try/catch blocks always type `catch` as `unknown`; narrow before use
- Server: structured error logging via pino before re-throwing or returning error state
- Async boundary errors bubbled as state rather than thrown (connection status, agent status)

**Error Messages:**

- Include context about what failed: `"Failed to create OpenCode session: ${JSON.stringify(response.error)}"`
- Include IDs when relevant: `"No pending permission request with id '${requestId}'"`

## Logging

**Framework:** Pino (`packages/server`) / `console.log` (app client-side)

**Server Patterns:**

- Root logger created via `createRootLogger(persistedConfig)` in `packages/server/src/server/logger.ts`
- Child loggers via `createChildLogger(parent, name)` or `logger.child({ module: "agent" })`
- Structured logging: `logger.error({ stderr: data }, "message")` not string interpolation
- Log level configured via `PASEO_LOG` env var; defaults to `"debug"` in dev
- Format configured via `PASEO_LOG_FORMAT`; `"pretty"` default, `"json"` for production
- Test logger: `createTestLogger()` from `packages/server/src/test-utils/test-logger.ts` (silent level)

**App Patterns:**

- Dev-only debug logging via `IS_DEV` guard: `if (!IS_DEV) return`
- Prefixed log messages: `[PanelStore] action`, `[HostRuntimeTransition]`
- `console.info` for structured transition logging with object payload

## Comments

**When to Comment:**

- JSDoc on complex exported interfaces and functions
- Block comments explaining non-obvious state machine logic
- Inline comments before non-obvious branches: `// Intentionally do not emit a connected state`
- Constants comment on upper bounds rationale: `// Upper bound is intentionally generous`

**JSDoc/TSDoc:**

- Used on exported hook functions that need param explanation:
  ```typescript
  /**
   * Hook that provides platform-aware panel state.
   *
   * On mobile, uses the state machine (mobileView).
   * On desktop, uses independent booleans.
   *
   * @param isMobile - Whether the current breakpoint is mobile
   */
  export function usePanelState(isMobile: boolean) {
  ```
- State machine types documented with multi-line block comments in source

## Function Design

**Size:** Functions kept small and single-purpose; complex logic extracted into private helpers

**Parameters:**

- Single object parameter for functions with ≥3 inputs; named `input` or descriptive name:
  ```typescript
  interface ShouldClearAgentAttentionOnViewInput { ... }
  export function shouldClearAgentAttentionOnView(input: ShouldClearAgentAttentionOnViewInput): boolean
  ```
- Destructure in function body, not signature, for complex types

**Return Values:**

- Explicit return types on exported functions
- `void` for side-effect functions; never implicit undefined
- Discriminated union returns for operations that can fail: `T | null` or status types

## Module Design

**Exports:**

- Named exports only — no default exports for values/functions
- Default exports only for React components (when platform split with `.d.ts`)
- Types re-exported via `export type { Foo } from "./module"`
- Barrel-style re-export at module boundary: `export * from "../shared/messages.js"`

**Barrel Files:**

- Used sparingly at package boundaries; not for every directory
- `packages/server/src/server/exports.ts` as server public API surface

## State Management

**Client-side (App):**

- Zustand for global UI state: `create<State>()(persist(...))` pattern
- Zustand stores always exported as `use{Name}Store` hook
- Persisted stores use `persist` middleware with `AsyncStorage` + explicit `version` and `migrate`
- TanStack Query for server data fetching and mutation

**Server-side:**

- Class-based controllers with `getSnapshot()` + `subscribe()` observer pattern:
  ```typescript
  class HostRuntimeController {
    getSnapshot(): Snapshot { ... }
    subscribe(listener: () => void): () => void { ... }
  }
  ```

## Platform-Specific Code

**Pattern:**

- `.d.ts` file declares the type/interface and re-exports from `.native`
- `.native.ts` implements for iOS/Android
- `.web.ts` implements for web/desktop
- No `.ios.ts` or `.android.ts` (single native implementation)

---

_Convention analysis: 2026-02-21_
