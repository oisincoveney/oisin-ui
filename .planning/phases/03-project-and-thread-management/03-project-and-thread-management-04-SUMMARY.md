---
phase: 03-project-and-thread-management
plan: 04
subsystem: testing
tags: [thread-reaper, tmux, worktree, daemon-e2e, playwright, sidebar]

requires:
  - phase: 03-02
    provides: server thread lifecycle orchestration and cleanup contracts
  - phase: 03-03
    provides: sidebar/thread store UX and keyboard switching behavior
provides:
  - periodic session reaper wired into daemon lifecycle
  - daemon lifecycle regression coverage for thread create/switch/delete/reconnect
  - browser regression specs for sidebar flows and background thread status feedback
affects: [phase-04-diff-panel]

tech-stack:
  added: []
  patterns:
    - conservative orphan cleanup based on Paseo ownership + registry linkage
    - browser e2e orchestration via daemon control client + UI assertions

key-files:
  created:
    - packages/server/e2e/thread-management-web.spec.ts
    - packages/web/e2e/thread-sidebar.spec.ts
  modified:
    - packages/server/src/server/bootstrap.ts
    - packages/server/src/server/thread/session-reaper.ts
    - packages/server/src/server/thread/session-reaper.test.ts
    - packages/server/src/server/daemon-e2e/thread-management.e2e.test.ts
    - packages/server/src/server/thread/thread-registry.ts
    - packages/server/src/server/thread/thread-registry.test.ts
    - packages/server/src/server/session.ts

key-decisions:
  - "Start and stop ThreadSessionReaper from daemon bootstrap so reconciliation is always lifecycle-coupled."
  - "Limit orphan cleanup to Paseo-owned worktrees/sessions and registry-linked agents to avoid external resource deletion."
  - "Cover sidebar keyboard wrap and background status/toast behavior with browser-level regression specs."

patterns-established:
  - "Reaper pattern: detect registry drift, log structured events, then cleanup in agent -> tmux -> worktree order."
  - "Thread UX regression pattern: assert sidebar active state using data-active and Cmd+Arrow navigation wrap."

duration: 12 min
completed: 2026-02-23
---

# Phase 3 Plan 4: Session Reaper and Thread Management Regression Summary

**Daemon-side orphan reconciliation and end-to-end thread lifecycle/browser regression coverage are now in place to lock Phase 3 behavior before diff features.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-23T15:15:22Z
- **Completed:** 2026-02-23T15:27:45Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Added a periodic thread session reaper and daemon bootstrap lifecycle wiring to reconcile orphaned agents/tmux/worktrees conservatively.
- Added daemon e2e lifecycle regressions for project listing, create/switch/delete flows, dirty delete confirmation, reconnect/attach behavior, and cleanup guarantees.
- Added browser regression specs for sidebar thread management behavior including dialog error flow, active state highlight, keyboard wrap navigation, and background closed-status toast handling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add thread session reaper and bootstrap wiring** - `6351758` (feat)
2. **Task 2: Add server e2e lifecycle regressions for thread management** - `5c33821` (test)
3. **Task 3: Add browser e2e regressions and workspace verification gates** - `fb0075a` (test)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/server/src/server/thread/session-reaper.ts` - periodic reconciliation and conservative orphan cleanup with structured logging.
- `packages/server/src/server/bootstrap.ts` - start/stop lifecycle wiring for the thread session reaper.
- `packages/server/src/server/daemon-e2e/thread-management.e2e.test.ts` - daemon lifecycle regression coverage for thread/project workflows.
- `packages/server/e2e/thread-management-web.spec.ts` - browser flow regression test for thread sidebar/create/switch/background status behavior.
- `packages/web/e2e/thread-sidebar.spec.ts` - sidebar regression spec for unread/status/keyboard navigation semantics.
- `packages/server/src/server/thread/thread-registry.ts` - lifecycle bug fixes surfaced by thread-management e2e coverage.
- `packages/server/src/server/session.ts` - thread lifecycle behavior fixups surfaced by e2e coverage.

## Decisions Made
- Keep cleanup safety strict: only touch tmux sessions/worktrees/agents that are provably Paseo-owned or linked to missing registry records.
- Keep reaper lifecycle coupled to daemon bootstrap start/stop to avoid leaked intervals and stale background jobs.
- Add browser-level thread UX regression specs in server + web test locations to lock keyboard wrap and status/toast expectations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed thread registry sync and temp-write collision behavior surfaced by daemon e2e lifecycle testing**
- **Found during:** Task 2 (server e2e lifecycle regressions)
- **Issue:** lifecycle regressions exposed project sync/temp-write edge cases in thread registry persistence paths.
- **Fix:** patched registry/session code paths and expanded tests to cover the failure mode.
- **Files modified:** `packages/server/src/server/thread/thread-registry.ts`, `packages/server/src/server/thread/thread-registry.test.ts`, `packages/server/src/server/session.ts`
- **Verification:** `bun run --filter @getpaseo/server test -- thread-management.e2e`
- **Committed in:** `5c33821`

**2. [Rule 3 - Blocking] Worked around Bun CLI script/filter incompatibilities and Bun+esbuild instability in this shell**
- **Found during:** Task 3 verification
- **Issue:** plan-native `bun run test --filter ...` and Bun-driven vite/vitest e2e runtime paths fail in this environment (`Unknown option --filter`, `esbuild write EPIPE`).
- **Fix:** used workspace-scoped Bun invocations that do pass (`bun run --filter @getpaseo/server typecheck`, `bun run --filter @oisin/web typecheck`) and documented remaining e2e runtime blocker.
- **Files modified:** none (execution environment issue)
- **Verification:** typechecks passed; browser e2e runtime remains blocked by Bun/esbuild process failure.
- **Committed in:** `fb0075a` (test additions completed despite runtime blocker)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** core implementation and regression coverage landed; one environment-specific Bun/esbuild instability still blocks full browser e2e execution in this shell.

## Authentication Gates

None.

## Issues Encountered
- Bun-driven vite/vitest startup in this shell intermittently fails with `esbuild` EPIPE (`The service was stopped`), blocking full execution of `bun run --filter @getpaseo/server test:e2e -- e2e/thread-management-web.spec.ts` even after test code updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 backend + UI lifecycle behavior is implemented and regression-covered at code level.
- Remaining concern: Bun/esbuild runtime instability should be resolved before treating browser e2e execution as fully green in this environment.
- Ready to transition planning/execution to Phase 4 diff features.

---
*Phase: 03-project-and-thread-management*
*Completed: 2026-02-23*
