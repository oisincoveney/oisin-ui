---
phase: 06-runtime-reliability-hardening
plan: 04
subsystem: ui
tags: [react, jotai, thread-store, attach-retry, vitest]

# Dependency graph
requires:
  - phase: 06-runtime-reliability-hardening-01
    provides: Structured create failure contract and pending-state rollback boundaries
  - phase: 06-runtime-reliability-hardening-03
    provides: Bounded attach recovery FSM and retry scheduling guards
provides:
  - Active-thread delete success now preserves explicit no-active UI state
  - Attach retry lifecycle is invalidated immediately when active thread is cleared
  - Regression tests lock delete-success null semantics and delete-failure rollback behavior
affects: [06-05, 06-06, 07-thread-metadata-contract]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Explicit no-active selection guard after destructive active-thread deletion
    - Attach retry invalidation tied to active-thread-null transition

key-files:
  created: []
  modified:
    - packages/web/src/thread/thread-store.ts
    - packages/web/src/App.tsx
    - packages/web/src/thread/thread-store.test.ts

key-decisions:
  - Preserve delete-driven null active selection across thread-list and ensure-default updates
  - Invalidate attach cycle guards when active thread clears to drop stale in-flight attach responses
  - Keep rollback semantics deterministic by restoring prior active only on delete failure

patterns-established:
  - "Delete success neutrality: active delete lands in No active thread and stays there until explicit user selection"
  - "Null-transition attach safety: clearing active thread cancels retry timers and invalidates pending attach cycle"

# Metrics
duration: 4 min
completed: 2026-02-25
---

# Phase 06 Plan 04: Active Delete Reliability Summary

**Active-thread deletion now lands immediately in a stable No active thread state, cancels stale attach retry activity, and restores prior selection only on delete failure.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T23:27:33Z
- **Completed:** 2026-02-25T23:31:39Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Updated `thread-store.ts` so successful active deletion keeps `activeThreadKey` null and prevents fallback reselection from thread-list/ensure-default updates.
- Updated `App.tsx` so active-thread-null transitions cancel pending attach/ensure work, clear retry timers, and bump attach cycle invalidation guards.
- Added deletion reliability regression coverage in `thread-store.test.ts` for success-null semantics, sidebar row removal, and failure rollback restoration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce delete-active immediate null and no auto-fallback** - `16c23aa` (fix)
2. **Task 2: Cancel attach retries when active thread is cleared** - `2b48ec2` (fix)
3. **Task 3: Add deletion reliability regression tests** - `2751ac4` (test)

## Files Created/Modified
- `packages/web/src/thread/thread-store.ts` - Added delete-driven null-selection guard state and prevented auto-fallback reselection after active delete success.
- `packages/web/src/App.tsx` - Added active-null attach-cycle invalidation and hard cancellation of pending attach/ensure retry state.
- `packages/web/src/thread/thread-store.test.ts` - Added active-delete success/failure regression cases and websocket-seeded state harness helpers.

## Decisions Made
- Treat active delete success as an explicit neutral state and preserve it until a user-initiated create/switch action occurs.
- Tie stale attach suppression to active-thread-null transitions by incrementing `attachCycleRef` and clearing pending attach intents.
- Keep rollback behavior constrained to delete-failure paths to avoid surprising fallback reselection after confirmed delete success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verification command used obsolete workspace filter**
- **Found during:** Task 1 verification
- **Issue:** `bun run --filter @getpaseo/web ...` matched no package in this repo (`@oisin/web` is current workspace name).
- **Fix:** Switched execution verification to `bun run --filter @oisin/web typecheck` and `bun x vitest run ...`.
- **Files modified:** None (execution-only adjustment)
- **Verification:** `bun run --filter @oisin/web typecheck` and `bun x vitest run packages/web/src/thread/thread-store.test.ts` both pass.
- **Commit:** N/A

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Verification command routing only; planned implementation scope unchanged.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RUN-04 delete-active reliability contract is now enforced with deterministic success and failure semantics.
- Ready for `06-05-PLAN.md` restart warm-up gating and restore/fallback hardening.

---
*Phase: 06-runtime-reliability-hardening*
*Completed: 2026-02-25*
