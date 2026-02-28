---
phase: 08-deterministic-verification-closure
plan: 01
subsystem: testing
tags: [playwright, e2e, browser, diff-panel, regression, ver-01]

# Dependency graph
requires:
  - phase: 07-thread-contract-completion
    provides: active-thread creation, worktree path in create response
provides:
  - VER-01 deterministic diff-panel browser regression (no conditional skip)
  - Isolated-runtime diff-panel spec in packages/server/e2e/
affects: [future-phases, ci-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use controlClient.createThread() in beforeAll to get worktreePath synchronously"
    - "Write files directly via Node.js fs/promises (no pty timing dependency)"
    - "Use git mv (execSync) for staged renames so git reports R100 status"
    - "Scope header toggle button to main > header to avoid diff-panel's internal <header>"

key-files:
  created:
    - packages/server/e2e/diff-panel.spec.ts
  modified: []
  deleted:
    - packages/web/e2e/diff-panel.spec.ts

key-decisions:
  - "Thread created via controlClient.createThread() (not UI) so worktreePath is available in beforeAll"
  - "Files written directly via Node.js fs/promises instead of terminal commands"
  - "git mv used for rename test (staged rename = R100 status = rename label in UI)"
  - "main > header selector used to scope toggle button away from diff-panel's internal header"

patterns-established:
  - "Isolated runtime pattern: startRuntime + controlClient.createThread in beforeAll"
  - "Deterministic file setup: write directly to worktreePath, no pty dependency"

# Metrics
duration: ~2h (iterative debugging)
completed: 2026-02-28
---

# Phase 8 Plan 1: Deterministic Verification Closure Summary

**VER-01 browser regression: diff-panel spec migrated to isolated runtime in packages/server/e2e/, all assertions pass without conditional skip**

## Performance

- **Duration:** ~2h (iterative debugging across multiple issues)
- **Completed:** 2026-02-28
- **Tasks:** 3 (+ iterative fixes)
- **Files created:** 1 (packages/server/e2e/diff-panel.spec.ts)
- **Files deleted:** 1 (packages/web/e2e/diff-panel.spec.ts)

## Accomplishments

- Migrated diff-panel spec from packages/web/e2e/ (ambient, conditional-skip) to packages/server/e2e/ (isolated runtime, no skip)
- Thread created via `controlClient.createThread()` in `beforeAll` — worktreePath available synchronously in response
- Files written directly via Node.js `fs/promises` — no pty timing dependency
- `git mv` used for rename test so git reports `R100` (staged rename), enabling the `README.md -> README.rename-e2e.md` label in the UI
- `main > header` selector scopes the toggle button away from the diff panel's internal `<header>` element
- All assertions are hard (no `test.skip` anywhere in the file)
- Test passes consistently (verified twice)

## Task Commits

1. **Task 1: Create isolated-runtime diff-panel spec** - `040c1d7`
2. **Task 2: Delete packages/web/e2e/diff-panel.spec.ts** - `c439c49`
3. **Task 3 (iterative fixes):** - `860d868`
   - Switch from filesystem rename to `git mv` (staged rename for R100 status)
   - Fix strict mode violation: `main > header` instead of `header` for toggle button
   - Remove unused `rename` import

## Files Created/Modified

- `packages/server/e2e/diff-panel.spec.ts` — created: isolated runtime, controlClient thread creation, deterministic file writes, git mv rename
- `packages/web/e2e/diff-panel.spec.ts` — deleted

## Decisions Made

- **controlClient.createThread() in beforeAll**: ThreadRegistry is per-session; creating via UI in a different session means the worktreePath isn't accessible. The create response includes `thread.worktreePath` synchronously.
- **git mv for rename**: Raw filesystem rename shows as D+A in `git diff --name-status HEAD`. Only staged renames (git mv) show as `R100`, which the server maps to `oldPath` and the UI renders as `old -> new`.
- **main > header**: The diff panel component has its own `<header>` element containing a "Close diff panel" button. `page.locator("header")` matched both. `page.locator("main > header")` scopes to the app-level header only.
- **hljs assertion replaced with d2h-code-line-ctn**: diff2html produces `d2h-*` CSS classes, not hljs classes. The original test (which was always skipped) had the wrong assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rename detection: filesystem rename shows as D+A, not R100**
- **Found during:** Task 3 (run e2e suite)
- **Issue:** `await rename(...)` (Node.js fs) does a raw filesystem rename. `git diff --name-status HEAD` shows it as `D README.md` + untracked `README.rename-e2e.md`. The UI shows separate files, not a rename label.
- **Fix:** `execSync("git mv README.md README.rename-e2e.md", { cwd: diffPanelWorktreePath })` stages the rename. Git reports `R100 README.md README.rename-e2e.md`. Server maps this to `oldPath`, UI renders `README.md -> README.rename-e2e.md`.
- **Committed in:** 860d868

**2. [Rule 1 - Bug] Strict mode violation: two "Close diff panel" buttons in `header`**
- **Found during:** Task 3 (run e2e suite)
- **Issue:** `page.locator("header")` matched both the app `<header>` and the diff panel's internal `<header>`. Both contain a "Close diff panel" button. Playwright strict mode rejects ambiguous locators.
- **Fix:** `page.locator("main > header")` scopes to the direct child of `<main>` only.
- **Committed in:** 860d868

---

**Total deviations:** 2 auto-fixed

## Issues Encountered

- ThreadRegistry is per-session (not shared in-memory): creating thread via UI in a different session meant the worktreePath wasn't accessible. Solved by using `controlClient.createThread()` in `beforeAll`.
- diff2html uses `d2h-*` classes, not hljs classes. The original test was always skipped and had wrong assertions. Fixed by asserting `.d2h-code-line-ctn`.
- Panel closes unexpectedly during rename test due to `activeThreadKey` change effect in App.tsx. Solved by explicitly closing and reopening the panel before the rename refresh.

## User Setup Required

None.

## Next Phase Readiness

- Phase 08 complete: both plans executed (08-01 and 08-02)
- VER-01 satisfied: diff-panel browser regression runs deterministically, no conditional skip
- VER-02 satisfied: thread management browser regression covers create->switch->delete
- Ready for gsd-verifier run and phase completion

---
*Phase: 08-deterministic-verification-closure*
*Completed: 2026-02-28*
