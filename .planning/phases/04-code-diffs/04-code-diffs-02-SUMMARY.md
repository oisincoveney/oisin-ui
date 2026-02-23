---
phase: 04-code-diffs
plan: 02
subsystem: ui
tags: [websocket, useSyncExternalStore, thread-store, diff-store, react]

requires:
  - phase: 04-01
    provides: thread summary payloads include nullable worktreePath and diff payload order is git-native
provides:
  - thread-scoped diff external store with active subscription correlation and per-thread cache
  - reconnect-safe checkout diff resubscribe flow with manual refresh action
  - startup-time thread-to-diff target wiring from thread store into diff store
affects: [04-03-diff-panel-shells, 04-04-diff-rendering]

tech-stack:
  added: []
  patterns:
    - external store owns checkout diff websocket subscribe/unsubscribe lifecycle keyed by active thread
    - app bootstrap synchronizes thread-store active context into diff-store without component-level socket lifecycle

key-files:
  created:
    - .planning/phases/04-code-diffs/04-code-diffs-02-SUMMARY.md
    - packages/web/src/diff/diff-types.ts
    - packages/web/src/diff/diff-store.ts
  modified:
    - packages/web/src/thread/thread-store.ts
    - packages/web/src/main.tsx

key-decisions:
  - "Keep diff state and websocket lifecycle in a dedicated external store and gate updates by active subscriptionId to prevent cross-thread leakage."
  - "Bridge thread->diff context at startup via store wiring so React components stay lifecycle-free for diff socket management."

patterns-established:
  - "Thread-scoped diff target pattern: resolve active thread cwd from worktreePath (fallback repoRoot) and hand it to diff store as a single target object."
  - "Reconnect-safe diff pattern: clear active subscription on disconnect states and resubscribe current target on connected transitions."

duration: 3 min
completed: 2026-02-23
---

# Phase 4 Plan 2: Thread-Scoped Diff Store and Startup Wiring Summary

**Web now maintains per-thread uncommitted diff snapshots in an external store that owns checkout diff websocket subscriptions, including reconnect-safe resubscribe and manual refresh hooks.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T21:09:16Z
- **Completed:** 2026-02-23T21:12:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `packages/web/src/diff/diff-types.ts` and `packages/web/src/diff/diff-store.ts` to define typed diff payload contracts and a `useSyncExternalStore` diff state container keyed by `projectId:threadId`.
- Implemented deterministic checkout diff subscription lifecycle (`subscribe_checkout_diff_request` / `unsubscribe_checkout_diff_request`) with active `subscriptionId` matching and reconnect-triggered resubscription.
- Extended thread client typing with nullable `worktreePath`, added active-thread diff target helper, and wired thread->diff target synchronization at app bootstrap in `main.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add thread-scoped diff external store with ws subscription lifecycle** - `b4f6b11` (feat)
2. **Task 2: Wire thread worktree context and diff-store startup** - `44651d9` (feat)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/web/src/diff/diff-types.ts` - typed contracts for parsed diff payloads, panel state, cache entries, and store state.
- `packages/web/src/diff/diff-store.ts` - external diff store with thread-scoped cache, panel actions, manual refresh action, and websocket lifecycle handlers.
- `packages/web/src/thread/thread-store.ts` - `ThreadSummary` includes nullable `worktreePath`; added `getActiveThreadDiffTarget` selector helper.
- `packages/web/src/main.tsx` - starts diff store and subscribes thread store changes to push active thread context into diff store.

## Decisions Made
- Keep diff websocket subscribe/unsubscribe handling entirely in diff-store and accept payloads only for the active `subscriptionId`.
- Resolve diff cwd from active thread `worktreePath` with project `repoRoot` fallback to keep subscriptions thread-correct even when worktree path is absent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Diff runtime data plane is in place for panel shells and diff rendering work in 04-03/04-04.
- Verification gate used `bun run --filter @oisin/web typecheck` and confirmed checkout diff websocket message sends exist only in `packages/web/src/diff/diff-store.ts`.

---
*Phase: 04-code-diffs*
*Completed: 2026-02-23*
