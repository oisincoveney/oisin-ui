---
phase: 11-hunk-staging-commit
plan: 01
subsystem: api
tags: [websocket, git, zod, checkout]

# Dependency graph
requires:
  - phase: 09-diff-panel-redesign
    provides: diff subscription refresh and staged/unstaged file model consumed by checkout actions
provides:
  - checkout_stage_request/response and checkout_unstage_request/response message contracts
  - server git wrappers for file-level stage and unstage operations
  - session handlers that execute stage/unstage and trigger checkout diff refresh
affects: [11-02-PLAN, DIFF-03, DIFF-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - extend checkout RPCs via requestId-correlated zod schemas in shared/messages
    - session mutation handlers emit response + scheduleCheckoutDiffRefreshForCwd on success

key-files:
  created:
    - .planning/phases/11-hunk-staging-commit/11-01-SUMMARY.md
  modified:
    - packages/server/src/shared/messages.ts
    - packages/server/src/utils/checkout-git.ts
    - packages/server/src/server/session.ts

key-decisions:
  - "Use git reset HEAD -- <path> for unstage to support newly staged files not present in HEAD."
  - "Mirror checkout_commit_request handler structure for stage/unstage for consistency and predictable error handling."

patterns-established:
  - "Checkout mutation parity: each new mutation request gets schema, git utility wrapper, session handler, and diff refresh trigger."

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 11 Plan 01: Backend Stage/Unstage Wiring Summary

**WebSocket stage/unstage RPC contracts now execute file-level git add/reset and refresh diff subscriptions through session handlers.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T22:11:53Z
- **Completed:** 2026-03-02T22:15:50Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added checkout stage/unstage request+response zod schemas and wired them into inbound/outbound session unions.
- Added `stageFile()` and `unstageFile()` wrappers in checkout git utilities using `git add --` and `git reset HEAD --`.
- Added session switch routing and dedicated stage/unstage handlers that emit typed responses and schedule diff refresh.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add message schemas for stage/unstage** - `3558e3d` (feat)
2. **Task 2: Add git wrapper functions for stage/unstage** - `5422960` (feat)
3. **Task 3: Add session handlers for stage/unstage requests** - `a9e8ca4` (feat)

## Files Created/Modified
- `packages/server/src/shared/messages.ts` - adds stage/unstage checkout message schemas and union membership.
- `packages/server/src/utils/checkout-git.ts` - adds exported `stageFile` and `unstageFile` git wrappers.
- `packages/server/src/server/session.ts` - imports wrappers, routes new request types, and handles stage/unstage responses.

## Decisions Made
- Used `git reset HEAD -- <path>` for unstaging to handle files newly added to index that do not exist in `HEAD`.
- Kept handler flow identical to commit handler pattern: try mutation -> refresh diff -> emit success/failure payload.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Backend stage/unstage foundation is complete and verified (typecheck + build).
Phase 11-02 can now wire frontend actions to these new server message types.

---
*Phase: 11-hunk-staging-commit*
*Completed: 2026-03-02*
