---
phase: 04-code-diffs
plan: 01
subsystem: api
tags: [thread-summary, git-diff, websocket, zod, vitest]

requires:
  - phase: 03-02
    provides: thread registry links persist worktreePath per thread
  - phase: 03-03
    provides: thread switch UX consumes thread list/create/switch payloads
provides:
  - thread summary contract now carries nullable per-thread worktreePath
  - checkout diff snapshots preserve git-provided file ordering without resorting
  - daemon checkout diff subscription regression asserts git-order file delivery
affects: [04-02-thread-diff-store, 04-03-diff-panel-shells, 04-04-diff-rendering]

tech-stack:
  added: []
  patterns:
    - additive thread summary contract extension with nullable optional fields for wire compatibility
    - checkout diff pipeline preserves upstream git/listing order instead of client-side resorting

key-files:
  created:
    - .planning/phases/04-code-diffs/04-code-diffs-01-SUMMARY.md
  modified:
    - packages/server/src/shared/messages.ts
    - packages/server/src/server/session.ts
    - packages/server/src/utils/checkout-git.ts
    - packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts

key-decisions:
  - "Expose thread.links.worktreePath as nullable worktreePath on ThreadSummary so diff consumers use true per-thread cwd."
  - "Treat listCheckoutFileChanges output order as source of truth for diff file order and remove alphabetic reordering."

patterns-established:
  - "Thread payload contract pattern: add optional+nullable fields in shared schema, then project source values in session adapters."
  - "Diff order regression pattern: assert mixed tracked/untracked sequences to guard against accidental alphabetical sorting."

duration: 1 min
completed: 2026-02-23
---

# Phase 4 Plan 1: Server Diff Contracts and Git-Order Alignment Summary

**Thread summaries now expose per-thread worktree paths and checkout diff updates preserve git output ordering, preventing cross-thread diff leakage and shuffled file lists before web diff UI integration.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-23T20:41:19Z
- **Completed:** 2026-02-23T20:43:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended thread summary contract with nullable `worktreePath` and projected `thread.links.worktreePath` through session summaries for list/create/switch thread payloads.
- Removed checkout diff path resorting so `getCheckoutDiff` keeps `listCheckoutFileChanges` git-order sequencing.
- Updated daemon e2e regression coverage to assert git-order semantics with tracked+untracked changes while keeping subscription correlation by `subscriptionId`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose thread worktree path in thread summary contract** - `ccdd734` (feat)
2. **Task 2: Preserve git diff file order and update subscription regression** - `ca9ad8a` (fix)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/server/src/shared/messages.ts` - `ThreadSummarySchema` now includes nullable `worktreePath`.
- `packages/server/src/server/session.ts` - `toThreadSummary` now forwards `thread.links.worktreePath` into outbound thread payloads.
- `packages/server/src/utils/checkout-git.ts` - removed alphabetical sort in `getCheckoutDiff` to preserve git/listing order.
- `packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts` - regression now validates tracked-then-untracked git-order update payload sequencing.

## Decisions Made
- Add `worktreePath` as nullable and optional in `ThreadSummarySchema` to remain additive/wire-compatible while exposing real thread cwd.
- Use git/listing order as canonical diff file order and guard it with an e2e assertion that fails if alphabetical sorting returns.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Targeted test command `bun run --filter @getpaseo/server test -- checkout-diff-subscription.e2e.test.ts` repeatedly failed in this shell with known `esbuild` startup `write EPIPE`; typecheck verification succeeded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Thread payload contract and diff ordering foundation are ready for Phase 4 diff-store and panel work.
- Existing environment blocker remains for Bun/Vitest startup (`esbuild` EPIPE) and may affect local execution of targeted daemon e2e tests.

---
*Phase: 04-code-diffs*
*Completed: 2026-02-23*
