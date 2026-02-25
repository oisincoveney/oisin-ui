---
phase: 06-runtime-reliability-hardening
plan: 03
subsystem: ui
tags: [react, websocket, xterm, toast, retry]

# Dependency graph
requires:
  - phase: 06-runtime-reliability-hardening-02
    provides: Bounded queued terminal input flushes after attach success
provides:
  - Bounded attach recovery state machine with 60s retry deadline
  - Visible connected-state retry banner with attempts and remaining window
  - One-shot Reconnected success signal after attach recovery
affects: [06-04, 06-05, 07-thread-metadata-contract]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Explicit attach recovery FSM (idle -> retrying -> failed)
    - Token-based one-shot reconnect toast dedupe

key-files:
  created:
    - packages/web/src/App.test.tsx
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/components/ConnectionOverlay.tsx

key-decisions:
  - Keep retry logic in App lifecycle with requestId/cycle guards unchanged
  - Show retry status as a non-blocking top banner while websocket is connected
  - Emit Reconnected toast once per recovery token

patterns-established:
  - "Bounded attach retry window: stop hard at 60s and surface actionable failure"
  - "Recovery success contract: clear stale attach errors and toast once"

# Metrics
duration: 4 min
completed: 2026-02-25
---

# Phase 06 Plan 03: Attach Recovery Summary

**Finite attach recovery now retries for 60 seconds with visible progress and emits exactly one Reconnected success signal on recovery.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T23:21:36Z
- **Completed:** 2026-02-25T23:26:16Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added explicit attach recovery lifecycle in `App.tsx` with `idle/retrying/failed`, deadline tracking, and retry timer cleanup.
- Surfaced retry state in `ConnectionOverlay.tsx` with attempt count, remaining recovery window, and last attach error.
- Added `App.test.tsx` regression tests for deadline stop behavior and one-shot recovery success signaling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bounded attach recovery state machine in App lifecycle** - `aacf547` (feat)
2. **Task 2: Surface attach retry indicator and recovery success signaling** - `429273d` (feat)
3. **Task 3: Add tests for bounded retry deadline and success clear** - `5c5497a` (test)

## Files Created/Modified
- `packages/web/src/App.tsx` - Attach recovery FSM, bounded retry scheduling, deadline failure handling, and one-shot reconnect toast gating.
- `packages/web/src/components/ConnectionOverlay.tsx` - Connected-state retry/failure banner with recovery telemetry.
- `packages/web/src/App.test.tsx` - Timer-driven state transition tests for bounded retries and success clear semantics.

## Decisions Made
- Retain existing stale response guard model (`requestId` + `cycleId`) and layer bounded retry policy on top.
- Use capped exponential retry delay (base 500ms, max 5s) inside a hard 60s deadline.
- Keep retry UI non-blocking so terminal output remains visible during recovery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verification command used obsolete workspace filter**
- **Found during:** Task 1 verification
- **Issue:** `bun run --filter @getpaseo/web ...` matched no package in this repo (`@oisin/web` is current name).
- **Fix:** Switched verification commands to use the current package target and direct `bun test` path for App tests.
- **Files modified:** None (execution-only adjustment)
- **Verification:** `bun run --filter @oisin/web typecheck` and `bun test packages/web/src/App.test.tsx` both pass.
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Verification command routing only; implementation scope unchanged.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RUN-02 core attach recovery contract is now finite, visible, and self-clearing.
- Ready for `06-04-PLAN.md` delete-active stale-attach cancellation hardening.

---
*Phase: 06-runtime-reliability-hardening*
*Completed: 2026-02-25*
