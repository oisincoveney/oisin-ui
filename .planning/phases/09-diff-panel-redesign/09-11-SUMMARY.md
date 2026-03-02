---
phase: 09-diff-panel-redesign
plan: 11
subsystem: terminal
tags: [tmux, terminal, cwd, worktree, rehydrate]

# Dependency graph
requires:
  - phase: 09-08
    provides: Diff cwd recovery baseline and UAT gap context for stale worktree paths
provides:
  - Thread terminal rehydrate validates stale worktreePath and falls back to project repoRoot
  - Stale tmux thread sessions are killed before session reuse when cwd is missing
  - Recovered terminal cwd is persisted back to thread registry links
affects: [phase-10, terminal-reliability, thread-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [filesystem existence guard before terminal reattach, thread-scoped cwd recovery with registry repair]

key-files:
  created: []
  modified:
    - packages/server/src/terminal/tmux-terminal.ts
    - packages/server/src/server/session.ts

key-decisions:
  - "Use fast existsSync checks for terminal cwd validity and project repoRoot fallback instead of git probing"
  - "Repair persisted thread.links.worktreePath immediately when fallback cwd is used"

patterns-established:
  - "Rehydrate safety: validate persisted filesystem links before reuse"
  - "Tmux reuse safety: kill stale session identity before has-session short-circuit"

# Metrics
duration: 4m 28s
completed: 2026-03-02
---

# Phase 09 Plan 11: Stale Terminal Cwd Recovery Summary

**Thread terminal rehydrate now recovers deleted worktree paths to project repoRoot and forces tmux session reset before reuse, eliminating stale-cwd reattach failures.**

## Performance

- **Duration:** 4m 28s
- **Started:** 2026-03-02T01:32:26Z
- **Completed:** 2026-03-02T01:36:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added stale-session invalidation in tmux bootstrap: missing cwd now triggers `kill-session` before `has-session` reuse.
- Added `resolveValidTerminalCwd` for thread terminal rehydrate, validating `worktreePath` and recovering to the owning project `repoRoot`.
- Persisted recovered cwd into `thread.links.worktreePath` so future rehydrates do not repeat stale-path failures.
- Verified with server typecheck (`bun run typecheck` in `packages/server`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Kill stale tmux session when cwd no longer exists before reattach** - `ef6d535` (fix)
2. **Task 2: Validate worktreePath before ensureThreadTerminal on rehydrate** - `dd19dba` (fix)

## Files Created/Modified
- `packages/server/src/terminal/tmux-terminal.ts` - Adds pre-reattach missing-cwd guard that kills stale tmux sessions.
- `packages/server/src/server/session.ts` - Adds terminal cwd recovery helper and uses it in thread terminal rehydrate with registry repair.

## Decisions Made
- Prefer `existsSync` for terminal cwd validation/recovery path because this branch needs fast filesystem truth, not full git validation.
- Use project-scoped lookup (`getProject(projectId)`) for fallback repoRoot to keep recovery deterministic to the owning thread project.
- Persist fallback cwd immediately when recovered to prevent repeated stale `worktreePath` usage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verification command `npx tsc --noEmit` blocked in this environment**
- **Found during:** Task 1 verification
- **Issue:** Shell policy blocks package-manager command `npx`, so the prescribed verify command could not run directly.
- **Fix:** Switched to repository-standard Bun script: `bun run typecheck` in `packages/server`.
- **Files modified:** None
- **Verification:** Typecheck passed (`tsc -p tsconfig.server.typecheck.json --noEmit`).
- **Committed in:** N/A (execution-only)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; verification path adapted to environment policy only.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal rehydrate now guards against deleted worktree cwd reuse and updates stale registry links.
- Ready for follow-up runtime/UAT confirmation of gap closure in thread switch scenarios.

---
*Phase: 09-diff-panel-redesign*
*Completed: 2026-03-02*
