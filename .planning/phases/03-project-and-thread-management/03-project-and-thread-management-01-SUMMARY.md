---
phase: 03-project-and-thread-management
plan: 01
subsystem: api
tags: [zod, daemon-config, thread-registry, rpc, daemon-client]
requires:
  - phase: 02-terminal-i
    provides: stable ensure/attach terminal bootstrap and reconnect lifecycle guarantees
provides:
  - canonical configured project repository list in persisted daemon config
  - persisted thread registry with project/thread identity, active pointer, and compatibility seed migration
  - project/thread RPC schemas and daemon-client methods with requestId-correlated responses
affects: [03-02-thread-lifecycle, 03-03-sidebar-store, 03-04-reaper-e2e]
tech-stack:
  added: []
  patterns:
    - canonical projects.repositories config as single source for configured repositories
    - thread registry persisted with atomic temp-write + rename updates
    - additive contract migration preserving legacy ensure_default_terminal fields
key-files:
  created:
    - packages/server/src/server/thread/thread-registry.ts
    - packages/server/src/server/thread/thread-registry.test.ts
  modified:
    - packages/server/src/server/persisted-config.ts
    - packages/server/src/server/config.ts
    - packages/server/src/server/bootstrap.ts
    - packages/server/src/shared/messages.ts
    - packages/server/src/client/daemon-client.ts
key-decisions:
  - "Normalize persisted projects config to projects.repositories=[] when absent so old config files remain startup-safe."
  - "Persist thread registry as a single JSON document under $PASEO_HOME with deterministic ordering and atomic rename writes."
  - "Keep ensure_default_terminal_response legacy placeholder fields intact while adding projectId/resolvedThreadId for migration."
patterns-established:
  - "Config normalization pattern: parse strict schema then normalize optional durable sections to deterministic defaults."
  - "Migration seed pattern: convert legacy placeholder-only thread state into a concrete compatibility project/thread record."
duration: 5 min
completed: 2026-02-23
---

# Phase 3 Plan 1: Canonical Project Registry and Thread Identity Foundation Summary

**Configured projects now load from a durable projects.repositories source, thread/project identity persists across restarts via a new registry, and project/thread RPC contracts are available end-to-end in shared schemas and daemon client APIs.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T14:37:19Z
- **Completed:** 2026-02-23T14:42:33Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Extended persisted daemon config with `projects.repositories` entries (`projectId`, `displayName`, `repoRoot`, optional `defaultBaseBranch`) and normalized missing config to an empty deterministic list.
- Added `packages/server/src/server/thread/thread-registry.ts` with persisted project/thread state, active thread pointer, launch config, terminal/agent/worktree links, unread/status metadata, and temp-file atomic write semantics.
- Implemented legacy placeholder migration in thread registry to synthesize a compatibility seed record preserving terminal/session linkage until real threads are created.
- Added shared message contracts and client methods for `project_list`, `project_add`, `thread_list`, `thread_create`, `thread_delete`, and `thread_switch`, plus thread status/unread update message shapes.
- Preserved Phase 2 terminal bootstrap compatibility by keeping `ensure_default_terminal_response` legacy fields and adding migration-safe `projectId`/`resolvedThreadId` fields.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add authoritative configured project registry to persisted daemon config** - `48117b5` (feat)
2. **Task 2: Implement persisted thread registry and migration-safe identity model** - `b1eb908` (feat)
3. **Task 3: Add project/thread RPC contracts and daemon-client methods with additive compatibility** - `b92d037` (feat)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/server/src/server/persisted-config.ts` - adds projects repository schema and compatibility normalization.
- `packages/server/src/server/config.ts` - exposes normalized configured project list on daemon runtime config.
- `packages/server/src/server/bootstrap.ts` - extends daemon config type with configured projects.
- `packages/server/src/server/thread/thread-registry.ts` - durable thread/project registry with migration and atomic persistence.
- `packages/server/src/server/thread/thread-registry.test.ts` - regression tests for deterministic load/save, legacy migration, and atomic writes.
- `packages/server/src/shared/messages.ts` - project/thread request/response/update schemas and additive terminal bootstrap compatibility fields.
- `packages/server/src/client/daemon-client.ts` - typed project/thread RPC methods and typed thread status/unread subscriptions.

## Decisions Made
- Use `projects.repositories` in persisted config as the only authoritative configured project source, not transient runtime state.
- Persist thread identity in a dedicated registry under `$PASEO_HOME/thread-registry.json` with deterministic sorting and atomic write+rename to minimize corruption risk.
- Keep legacy `ensure_default_terminal_response` placeholder fields during rollout and introduce additive concrete identity fields for migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended daemon runtime type to expose configured projects**
- **Found during:** Task 1 (configured project registry wiring)
- **Issue:** `loadConfig` could not return canonical configured projects without updating `PaseoDaemonConfig`.
- **Fix:** Added `configuredProjects` to `packages/server/src/server/bootstrap.ts` daemon config type and wired normalized values from config loader.
- **Files modified:** `packages/server/src/server/bootstrap.ts`, `packages/server/src/server/config.ts`
- **Verification:** `npm run typecheck --workspace=@getpaseo/server`
- **Committed in:** `48117b5`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Deviation was required to expose canonical configured projects without type contract drift.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 identity and contract foundation is now in place for lifecycle orchestration in `03-02-PLAN.md`.
- No blockers identified for create/switch/delete thread lifecycle implementation.

---
*Phase: 03-project-and-thread-management*
*Completed: 2026-02-23*
