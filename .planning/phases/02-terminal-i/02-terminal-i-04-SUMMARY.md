---
phase: 02-terminal-i
plan: 04
subsystem: terminal
tags: [websocket, terminal, tmux, race-condition, e2e]
requires:
  - phase: 02-03
    provides: reconnect-safe attach flow and terminal stream continuity baseline
provides:
  - client-side single-flight ensure_default_terminal bootstrap with requestId correlation
  - server-side single-flight ensureDefaultTerminal resolution under concurrent callers
  - stale default-terminal id fallback in attach/input paths to keep stream routing stable
  - concurrent ensure/attach/input regression coverage with non-null streamId and live output
affects: [phase-02-uat, terminal-runtime, phase-03-thread-routing]
tech-stack:
  added: []
  patterns:
    - requestId-correlated RPC handling for ensure terminal bootstrap
    - single-flight default terminal creation to prevent identity churn
    - stale-id recovery only for known default identities
key-files:
  created: []
  modified:
    - packages/web/src/App.tsx
    - packages/server/src/terminal/terminal-manager.ts
    - packages/server/src/server/session.ts
    - packages/server/src/server/daemon-e2e/terminal.e2e.test.ts
    - packages/server/src/terminal/tmux-terminal.ts
key-decisions:
  - "Treat ensure_default_terminal as a single-flight operation on both client and server to remove race-created terminal id churn."
  - "Only apply stale-id fallback for previously ensured default terminal ids so unknown custom terminal ids still fail fast."
patterns-established:
  - "Default terminal bootstrap must correlate responses by requestId before mutating client terminal identity."
  - "Attach/input stale-id recovery resolves through ensureDefaultTerminal and returns the stable live terminal."
duration: 1 min
completed: 2026-02-22
---

# Phase 2 Plan 4: Terminal Bootstrap Race Summary

**Concurrent default-terminal bootstrap now resolves to one stable identity, with attach/input preserved and covered by race regression e2e tests.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-23T01:35:37Z
- **Completed:** 2026-02-23T01:36:55Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added client ensure single-flight flow in `packages/web/src/App.tsx` so only one ensure request is active and stale ensure responses are ignored by requestId.
- Added server single-flight terminal ensure in `packages/server/src/terminal/terminal-manager.ts` and stale default-id fallback in `packages/server/src/server/session.ts` for attach/input race hardening.
- Added focused regression coverage in `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` validating concurrent ensure, non-null stream attach, and live `echo` output via terminal input.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add client ensure single-flight with requestId-correlated response handling** - `f5b79c7` (feat)
2. **Task 2: Add server single-flight ensure lock and stale-id attach/input hardening** - `67f9c7c` (fix)
3. **Task 3: Lock regression for concurrent ensure + attach + input reliability** - `dd9597a` (test)

## Files Created/Modified
- `packages/web/src/App.tsx` - serializes ensure requests and enforces requestId-correlated ensure response acceptance before attach.
- `packages/server/src/terminal/terminal-manager.ts` - adds in-flight ensure lock so concurrent ensures share one terminal resolution.
- `packages/server/src/server/session.ts` - adds known-default stale id recovery path for attach/input while preserving unknown-id behavior.
- `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` - adds concurrent ensure attach/input regression asserting stable stream and live output.
- `packages/server/src/terminal/tmux-terminal.ts` - removes unused `Pos` import that blocked server workspace typecheck.

## Decisions Made
- Gate default terminal bootstrap to one in-flight ensure request on both client and server to eliminate response-order races.
- Restrict stale terminal-id fallback to ids previously returned by ensure_default_terminal, preserving fast-fail semantics for truly unknown ids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused type import that failed server workspace typecheck**
- **Found during:** Task 2 (server typecheck verification)
- **Issue:** `packages/server/src/terminal/tmux-terminal.ts` imported `Pos` but did not use it, causing TS6133 and blocking verification.
- **Fix:** Removed unused `Pos` type import.
- **Files modified:** `packages/server/src/terminal/tmux-terminal.ts`
- **Verification:** `npm run typecheck --workspace=@getpaseo/server` passes.
- **Committed in:** `67f9c7c` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking fix only; no scope expansion.

## Issues Encountered

- Server workspace typecheck initially failed on pre-existing unused import (`TS6133`); fixed inline and re-ran verification successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UAT Test 2 race condition is now covered by automated regression and stable default terminal stream attach/input behavior.
- Phase 2 terminal reliability remains complete with the bootstrap race gap closed.

---
*Phase: 02-terminal-i*
*Completed: 2026-02-22*
