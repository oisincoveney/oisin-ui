---
phase: 10-sqlite-thread-registry
plan: 02
subsystem: database
tags: [sqlite, thread-registry, session, runtime-metadata]

# Dependency graph
requires:
  - phase: 10-01
    provides: SQLite init/bootstrap and base projects/threads schema
provides:
  - SQLite-backed ThreadRegistry preserving existing public API shape/signatures
  - Runtime-only `agentId`/`sessionKey` maps layered onto DB-backed thread reads
  - Thread status contract cleanup removing `unknown` from server and shared message schema
affects: [10-03, 10-04, 10-05, session, thread-lifecycle, persistence]

# Tech tracking
tech-stack:
  added: []
  patterns: [DB-backed registry snapshot rebuilding plus runtime overlay maps for volatile linkage]

key-files:
  created: []
  modified:
    - packages/server/src/server/thread/thread-registry.ts
    - packages/server/src/server/session.ts
    - packages/server/src/shared/messages.ts

key-decisions:
  - "Thread creation always persists as idle in SQLite; no provisioning/unknown status path"
  - "agentId/sessionKey stay runtime-only via in-memory maps keyed by thread identity"
  - "worktreePath is required on create/update writes to satisfy DB NOT NULL contract"

patterns-established:
  - "ThreadRegistry load path initializes db once and refreshes in-memory snapshot from projects/threads queries"
  - "ThreadRecord links are composed from persisted columns (worktree/terminal) plus runtime maps (agent/session)"

# Metrics
duration: 4m
completed: 2026-03-02
---

# Phase 10 Plan 02: SQLite ThreadRegistry Migration Summary

**ThreadRegistry now persists projects/threads in SQLite with unchanged caller-facing APIs while keeping agent/session linkage runtime-only and removing `unknown` thread status.**

## Performance

- **Duration:** 4m
- **Started:** 2026-03-02T04:10:06Z
- **Completed:** 2026-03-02T04:14:14Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Replaced JSON-file state with SQLite CRUD/query logic in `ThreadRegistry`, wired through `initDb`/`getDb`.
- Preserved public registry method signatures and exported types used by `session.ts`/`thread-lifecycle.ts` callers.
- Implemented runtime-only `agentId` + `sessionKey` maps and merged them into returned `ThreadRecord.links`.
- Enforced required `worktreePath` on write paths and created threads directly with persisted `status='idle'`.
- Removed thread status `unknown` from registry/session/message contracts; fallback lifecycle mapping now uses `error`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ThreadRegistry with SQLite backend** - `21bf370` (feat)

## Files Created/Modified
- `packages/server/src/server/thread/thread-registry.ts` - Full SQLite-backed registry rewrite, runtime overlay maps, DB row mapping.
- `packages/server/src/server/session.ts` - Thread summary status union cleanup and lifecycle fallback to `error`.
- `packages/server/src/shared/messages.ts` - Thread summary status schema cleanup removing `unknown`.

## Decisions Made
- Keep DB as source of truth for project/thread state while preserving in-process maps for volatile runtime-only identifiers.
- Keep global single-active-thread behavior by clearing other projects' `active_thread_id` on switch/create activation.
- Keep `flush()`/`load()` compatibility methods even though SQLite writes are immediate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Robust thread-key encoding for runtime maps**
- **Found during:** Task 1 (SQLite registry rewrite)
- **Issue:** Naive `projectId:threadId` map key parsing would break when IDs contain `:`.
- **Fix:** Switched to NUL-delimited key encoding with dedicated parser.
- **Files modified:** `packages/server/src/server/thread/thread-registry.ts`
- **Verification:** `bun run typecheck` and map-lookup path compilation passed.
- **Committed in:** `21bf370` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope expansion; fix hardens runtime map correctness under valid identifier values.

## Issues Encountered
- `npx` command execution is blocked in environment policy; verification used Bun equivalents (`bun run typecheck`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Registry persistence migration is complete and compile-verified; follow-up plans can build drift-reconciliation and cleanup on SQLite-backed state.
- Runtime-only linkage contract (`agentId`/`sessionKey`) remains intact for thread lifecycle/session flows.

---
*Phase: 10-sqlite-thread-registry*
*Completed: 2026-03-02*
