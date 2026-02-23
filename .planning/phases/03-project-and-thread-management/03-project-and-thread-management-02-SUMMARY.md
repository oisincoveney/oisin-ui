---
phase: 03-project-and-thread-management
plan: 02
subsystem: api
tags: [thread-lifecycle, worktree, tmux, websocket, agent-manager]
requires:
  - phase: 03-01
    provides: persisted project/thread registry foundation and RPC contracts
provides:
  - transactional thread create/switch/delete orchestration with rollback-safe cleanup
  - deterministic per-thread tmux session identity derived from project/thread ids
  - session-layer project/thread handlers wired to lifecycle service and registry updates
affects: [03-03-sidebar-store, 03-04-reaper-e2e, phase-04-diff-thread-context]
tech-stack:
  added: []
  patterns:
    - thread lifecycle transaction pattern with compensating rollback across worktree/tmux/agent resources
    - thread-aware terminal session key derivation for deterministic reattach semantics
    - registry-driven thread status and unread projection from agent lifecycle/stream events
key-files:
  created:
    - packages/server/src/server/thread/thread-lifecycle.ts
    - packages/server/src/server/thread/thread-lifecycle.test.ts
  modified:
    - packages/server/src/server/session.ts
    - packages/server/src/server/thread/thread-registry.ts
    - packages/server/src/terminal/terminal-manager.ts
    - packages/server/src/utils/worktree.ts
    - packages/server/src/shared/messages.ts
    - packages/server/src/client/daemon-client.ts
key-decisions:
  - "Drive thread create/delete/switch from a dedicated lifecycle service so rollback and cleanup stay centralized and testable."
  - "Use deterministic tmux session keys with sanitized project/thread segments plus stable hash suffix for collision-safe identity."
  - "Require explicit forceDirtyDelete on thread delete when git porcelain status is non-empty to protect uncommitted work."
patterns-established:
  - "Lifecycle rollback pattern: on create failure, close agent, kill thread tmux session, and delete worktree before returning error."
  - "Thread activity projection pattern: derive status/unread updates from agent state and non-user timeline output events."
duration: 14 min
completed: 2026-02-23
---

# Phase 3 Plan 2: Server Thread Lifecycle Orchestration Summary

**Server-side thread lifecycle now provisions worktree+tmux+agent atomically, supports non-destructive thread switching with stream-safe reattach targets, and enforces dirty-worktree force confirmation before destructive delete cleanup.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-23T14:40:18Z
- **Completed:** 2026-02-23T14:54:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added `ThreadLifecycleService` with strict create order (worktree -> thread terminal -> agent -> registry persist) and compensating rollback on failure.
- Added thread-aware terminal manager APIs for deterministic per-thread tmux keys, ensure-by-thread identity, and kill-by-session-key cleanup.
- Added reusable dirty-worktree guard helpers and checked delete helper in worktree utilities, with explicit dirty-state error semantics.
- Wired session RPC handlers for `project_list`, `project_add`, `thread_list`, `thread_create`, `thread_switch`, and `thread_delete` to registry+lifecycle runtime behavior.
- Preserved Phase 2 attach/stream-id protections while adding thread status/unread projection events from agent lifecycle and background output.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build transactional thread lifecycle service** - `335b93d` (feat)
2. **Task 2: Wire session handlers for project/thread create/switch/delete and stream reattach** - `9e421a1` (feat)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/server/src/server/thread/thread-lifecycle.ts` - lifecycle transaction service for create/switch/delete with rollback and dirty-delete protection.
- `packages/server/src/server/thread/thread-lifecycle.test.ts` - lifecycle regression tests for rollback and dirty-delete guard behavior.
- `packages/server/src/server/thread/thread-registry.ts` - added project/thread query helpers used by session + lifecycle orchestration.
- `packages/server/src/terminal/terminal-manager.ts` - added deterministic thread session key derivation and thread session ensure/kill APIs.
- `packages/server/src/utils/worktree.ts` - added porcelain dirty checks and checked deletion wrapper with explicit dirty error type.
- `packages/server/src/server/session.ts` - added project/thread RPC handlers, lifecycle wiring, and thread status/unread event emission.
- `packages/server/src/shared/messages.ts` - extended thread delete request schema with optional `forceDirtyDelete` override flag.
- `packages/server/src/client/daemon-client.ts` - exposed optional `forceDirtyDelete` in delete thread client request.

## Decisions Made
- Keep lifecycle orchestration outside `Session` in a dedicated service so create/delete rollback behavior remains deterministic and reusable.
- Use thread labels (`projectId`, `threadId`) on created agents to keep future thread-to-agent reconciliation straightforward.
- Treat dirty worktree delete as a guarded error path unless `forceDirtyDelete=true` is explicitly provided.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed constructor initialization ordering for thread lifecycle wiring**
- **Found during:** Task 2 (session handler wiring)
- **Issue:** `sessionLogger` was referenced before assignment when initializing thread registry/lifecycle fields.
- **Fix:** Moved thread registry/lifecycle construction to run after `sessionLogger` initialization in the constructor.
- **Files modified:** `packages/server/src/server/session.ts`
- **Verification:** `npm run typecheck --workspace=@getpaseo/server`
- **Committed in:** `9e421a1`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was required for compilation correctness and did not expand scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server lifecycle and RPC orchestration are ready for sidebar/external-store integration in `03-03-PLAN.md`.
- Deterministic thread terminal identity and dirty-delete guardrails are in place for upcoming UI and reaper coverage.

---
*Phase: 03-project-and-thread-management*
*Completed: 2026-02-23*
