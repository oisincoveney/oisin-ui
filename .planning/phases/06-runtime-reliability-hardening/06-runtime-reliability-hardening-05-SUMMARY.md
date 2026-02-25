---
phase: 06-runtime-reliability-hardening
plan: 05
subsystem: ui
tags: [react, jotai, websocket, runtime-recovery, sidebar]

# Dependency graph
requires:
  - phase: 06-03
    provides: bounded attach recovery state machine and reconnect signaling
  - phase: 06-04
    provides: active-thread null-state reliability on delete
provides:
  - serverId-driven restart detection and warm-up state
  - warm-up locking for create/switch/delete actions with explicit reason
  - deterministic restore-or-fallback active-thread resolution after restart
affects: [phase-07-thread-metadata-contract-closure, phase-08-verification-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Restart-aware warm-up gate keyed by daemon serverId"
    - "Recovery completion requires both thread refresh and attach settle"

key-files:
  created: []
  modified:
    - packages/web/src/lib/ws.ts
    - packages/web/src/thread/thread-store.ts
    - packages/web/src/components/app-sidebar.tsx
    - packages/web/src/App.tsx
    - packages/web/src/thread/thread-store.test.ts

key-decisions:
  - "Use server_info.serverId changes as restart trigger instead of transport reconnect state alone."
  - "Hold risky actions behind warm-up lock until both project/thread refresh and attach settle complete."
  - "Restore previous active thread when present; otherwise choose newest thread by updatedAt."

patterns-established:
  - "Warm-up lock reason is store-driven so UX + action guards stay consistent."
  - "Reconnected toast is emitted from runtime recovery completion path to avoid duplicate restart signaling."

# Metrics
duration: 6 min
completed: 2026-02-25
---

# Phase 06 Plan 05: Restart Warm-up Gating Summary

**Daemon restart now enters bounded warm-up with serverId detection, locks risky thread actions, and deterministically restores active context with a single recovery success signal.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T23:32:55Z
- **Completed:** 2026-02-25T23:39:51Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Parsed `status: server_info` in web transport path and exposed `serverId` extraction for app consumers.
- Added runtime recovery/warm-up state in thread store, including restart detection, lock reason, and completion gating metadata.
- Disabled create/switch/delete in sidebar during warm-up with explicit tooltip reason and minimal warm-up chip.
- Implemented restore-prior-or-fallback-newest thread resolution after warm-up, plus single `Reconnected` toast on successful recovery completion.
- Added regression coverage for warm-up restore, fallback selection, and action lock blocking.

## Task Commits

Each task was committed atomically:

1. **Task 1: Consume server_info.serverId and model restart warm-up state** - `70a47e5` (feat)
2. **Task 2: Gate risky thread actions with minimal warm-up UX** - `f464e8c` (feat)
3. **Task 3: Implement restore-or-fallback selection and recovery success clear** - `22b2b82` (feat)

## Files Created/Modified
- `packages/web/src/lib/ws.ts` - server-info parsing helper for status/session messages.
- `packages/web/src/thread/thread-store.ts` - runtime warm-up/recovery state, lock enforcement, restore/fallback completion path.
- `packages/web/src/components/app-sidebar.tsx` - warm-up chip + disabled controls + tooltip lock reason.
- `packages/web/src/App.tsx` - serverId ingestion + warm-up attach-settle hooks + runtime recovery toast clear path.
- `packages/web/src/thread/thread-store.test.ts` - restart warm-up and fallback regression tests.

## Decisions Made
- Server restart detection is keyed to daemon `serverId` identity change, not inferred from reconnect alone.
- Warm-up lock spans risky actions until both list refresh and attach settle complete to avoid churn.
- Recovery completion resolves active thread deterministically: previous active first, then newest by `updatedAt`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verification commands used non-existent web workspace filter/test script**
- **Found during:** Task 1 and Task 3 verification
- **Issue:** `bun run --filter @getpaseo/web ...` and `bun run --filter @oisin/web test ...` did not run in this repo layout.
- **Fix:** Switched verification to valid commands: `bun run --filter @oisin/web typecheck` and `bunx vitest packages/web/src/thread/thread-store.test.ts`.
- **Files modified:** None (execution-only correction)
- **Verification:** Typecheck and targeted tests passed.
- **Committed in:** N/A (command-level correction)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; verification path aligned to actual workspace tooling.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RUN-01 restart path is now bounded, action-safe, and deterministic.
- Ready for `06-06-PLAN.md` verification closure.

---
*Phase: 06-runtime-reliability-hardening*
*Completed: 2026-02-25*
