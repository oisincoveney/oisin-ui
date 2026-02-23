---
phase: 03-project-and-thread-management
plan: 03
subsystem: ui
tags: [react, shadcn, sidebar, dialog, useSyncExternalStore, terminal-stream]

requires:
  - phase: 03-01
    provides: project/thread identity contracts and persisted thread metadata model
  - phase: 03-02
    provides: server-side thread lifecycle RPC handlers and thread terminal identities
provides:
  - external thread store boundary with ws-safe subscriptions and actions
  - sidebar project/thread UX with active, unread, and status presentation
  - create/delete dialogs and attach rebind flow with keyboard thread navigation
affects: [03-04-reaper-e2e, phase-04-diff-panel]

tech-stack:
  added: []
  patterns:
    - external ws-backed thread state via useSyncExternalStore
    - optimistic thread switching with server reconciliation
    - attach-by-active-thread terminal orchestration without killing background sessions

key-files:
  created:
    - packages/web/src/thread/thread-store.ts
    - packages/web/src/components/app-sidebar.tsx
    - packages/web/src/components/thread-create-dialog.tsx
    - packages/web/src/components/thread-delete-dialog.tsx
    - packages/web/src/components/ui/sidebar.tsx
    - packages/web/src/components/ui/dialog.tsx
    - packages/web/src/components/ui/alert-dialog.tsx
    - packages/web/src/components/ui/input.tsx
    - packages/web/src/components/ui/label.tsx
    - packages/web/src/components/ui/button.tsx
    - packages/web/src/components/ui/collapsible.tsx
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/main.tsx

key-decisions:
  - "Keep thread/session state in a standalone store module and expose snapshot hooks with useSyncExternalStore."
  - "Treat thread switch as terminal stream re-attach to selected terminal id, preserving previous thread runtime in background."
  - "Require second destructive confirmation in delete flow when server reports dirty worktree conditions."

patterns-established:
  - "Store-first UI pattern: dialogs and sidebar issue requests through thread-store actions instead of component-owned ws handlers."
  - "Keyboard navigation pattern: Cmd+ArrowUp/ArrowDown maps to wrapped thread order from store state."

duration: 11 min
completed: 2026-02-23
---

# Phase 3 Plan 3: Shadcn Sidebar and Thread Switching UX Summary

**Web thread management now uses an external thread store, a shadcn-style sidebar/dialog UX, and active-thread terminal stream rebind logic with Cmd+Up/Down wraparound navigation.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-23T14:45:00Z
- **Completed:** 2026-02-23T14:56:24Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Added `packages/web/src/thread/thread-store.ts` as external state boundary for projects, threads, active selection, unread/status updates, request pending flags, and ws message handling.
- Implemented shadcn-style sidebar primitives and composed project/thread sidebar UI with active row highlighting, unread indicator, status marker, and top-level/per-project New Thread actions.
- Added create thread dialog with deterministic validation, provider/command/base-branch controls, inline error rendering, and loading/disabled state handling.
- Added delete thread dialog with always-available action and dirty-worktree second-confirmation flow before destructive delete retry.
- Rebound terminal attach flow in `packages/web/src/App.tsx` to active thread terminal ids from store and added Cmd+ArrowUp/Cmd+ArrowDown wrapped thread switching with `preventDefault`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shadcn sidebar/dialog primitives and external thread store** - `8d8bde1` (feat)
2. **Task 2: Implement create/delete thread dialogs with locked UX constraints** - `c0fc62c` (feat)
3. **Task 3: Rebind terminal attach on active-thread switch and add keyboard wrap navigation** - `7fb14ef` (feat)

**Plan metadata:** pending docs commit for SUMMARY/STATE updates

## Files Created/Modified
- `packages/web/src/thread/thread-store.ts` - ws-backed external store, request actions, and thread/project snapshot hooks.
- `packages/web/src/components/app-sidebar.tsx` - project/thread sidebar composition with active/unread/status rendering and dialog launch points.
- `packages/web/src/components/thread-create-dialog.tsx` - create thread form with provider/command/base branch controls and inline errors.
- `packages/web/src/components/thread-delete-dialog.tsx` - delete flow with dirty-worktree extra confirmation path.
- `packages/web/src/components/ui/sidebar.tsx` - sidebar primitives used by app sidebar layout.
- `packages/web/src/components/ui/dialog.tsx` - dialog primitives used by create/delete flows.
- `packages/web/src/components/ui/alert-dialog.tsx` - alert dialog aliases for destructive confirmation flow.
- `packages/web/src/components/ui/input.tsx` - shared input primitive used by thread forms.
- `packages/web/src/components/ui/label.tsx` - shared label primitive for form fields.
- `packages/web/src/components/ui/button.tsx` - shared button variants for sidebar and dialogs.
- `packages/web/src/components/ui/collapsible.tsx` - collapsible project grouping primitive.
- `packages/web/src/main.tsx` - sidebar shell wiring and thread store bootstrap.
- `packages/web/src/App.tsx` - active-thread attach orchestration and keyboard thread navigation handling.

## Decisions Made
- Keep thread lifecycle and sidebar/dialog request state outside React component local state via a dedicated store + `useSyncExternalStore` hooks.
- Keep thread switch semantics additive to Phase 2 stream lifecycle: switching sends new attach request to selected terminal and does not kill previous thread session.
- Surface thread creation failures inline in dialog and avoid toast-only error paths for this flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided package lock mismatch hook failure by implementing local shadcn-style primitives without introducing new installed dependencies**
- **Found during:** Task 1 (sidebar/dialog primitive wiring)
- **Issue:** Pre-commit hook blocked `package.json` dependency changes because `bun.lock` was already dirty in workspace and not safely stageable.
- **Fix:** Kept implementation self-contained in `packages/web/src/components/ui/*` primitives and removed dependency edits, preserving atomic task commits.
- **Files modified:** `packages/web/src/components/ui/button.tsx`, `packages/web/src/components/ui/collapsible.tsx`, `packages/web/src/components/ui/sidebar.tsx`
- **Verification:** `npm run typecheck --workspace=@oisin/web`
- **Committed in:** `8d8bde1`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; implementation still satisfied required UX/state behavior while respecting repository pre-commit constraints.

## Issues Encountered

- Pre-commit guard rejected staged dependency updates without lockfile staging; resolved by local primitive implementation in-task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Thread-aware web UX is in place for project/thread management with create/delete/switch interactions and keyboard navigation.
- Ready for `03-04-PLAN.md` session reaper and end-to-end regression coverage.

---
*Phase: 03-project-and-thread-management*
*Completed: 2026-02-23*
