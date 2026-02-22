---
phase: 02-terminal-i
plan: 03
subsystem: terminal
tags: [websocket, xterm, tmux, reconnect, resize, e2e]
requires:
  - phase: 02-01
    provides: tmux-authoritative terminal sessions and attach/reset stream primitives
  - phase: 02-02
    provides: xterm rendering and binary mux stream wiring in the web client
provides:
  - infinite reconnect status machine with explicit disconnected/reconnecting transitions
  - reconnect-safe attach flow with refresh fallback and catch-up scroll restoration
  - debounce-based browser resize propagation from xterm to tmux-backed sessions
  - e2e regression coverage for resize continuity during active terminal streaming
affects: [phase-03-thread-routing, terminal-runtime, reconnect-ux]
tech-stack:
  added: []
  patterns:
    - reconnect with infinite exponential backoff plus console telemetry
    - attach with resume offset and automatic full-redraw fallback on reset/gap
    - ResizeObserver + debounced rows/cols propagation to backend resize messages
key-files:
  created:
    - packages/web/src/terminal/terminal-resize.ts
  modified:
    - packages/web/src/lib/ws.ts
    - packages/web/src/terminal/terminal-stream.ts
    - packages/web/src/terminal/terminal-view.tsx
    - packages/web/src/App.tsx
    - packages/web/src/components/ConnectionOverlay.tsx
    - packages/server/src/server/session.ts
    - packages/server/src/server/daemon-e2e/terminal.e2e.test.ts
key-decisions:
  - "Use explicit reconnect statuses (disconnected -> reconnecting -> connected) so UI state changes instantly at socket failure."
  - "Force redraw from server on reconnects and stale resume offsets to guarantee terminal consistency over partial replay."
patterns-established:
  - "Terminal input is not buffered across disconnects; stale keystrokes are dropped by design."
  - "Attach requests include rows/cols and resize updates are debounced to avoid tmux jitter."
duration: 3 min
completed: 2026-02-22
---

# Phase 2 Plan 3: Reconnect Reliability Summary

**Reconnect-safe terminal runtime now survives socket drops, catch-up replay, and browser resize without losing active stream continuity.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T04:55:38Z
- **Completed:** 2026-02-22T04:58:22Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Hardened web socket lifecycle in `packages/web/src/lib/ws.ts` with infinite retry telemetry and explicit reconnect state transitions.
- Implemented reconnect-aware terminal attach behavior in `packages/web/src/App.tsx` and `packages/web/src/terminal/terminal-stream.ts`, including reset/gap full redraw fallback and catch-up scroll-to-bottom.
- Added `ResizeObserver` + debounced resize propagation in `packages/web/src/terminal/terminal-resize.ts` and `packages/web/src/terminal/terminal-view.tsx`, with attach rows/cols applied server-side in `packages/server/src/server/session.ts`.
- Expanded daemon terminal reliability checks in `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` for attach dimensions and streaming continuity during resize churn.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement resilient reconnect flow with reset redraw + catch-up** - `d0a012e` (feat)
2. **Task 2: Add debounced resize pipeline across xterm/ws/tmux** - `d37a9b6` (feat)
3. **Task 3: Lock reliability with reconnect regression coverage** - `c578fdd` (test)

## Files Created/Modified
- `packages/web/src/lib/ws.ts` - wrapped session envelopes, reconnect telemetry, and no-cap backoff state transitions.
- `packages/web/src/App.tsx` - reconnect attach orchestration, refresh fallback logic, resize message emission, and catch-up scroll handling.
- `packages/web/src/terminal/terminal-stream.ts` - replay-aware chunk handling, ack flow, and stale-input drop behavior.
- `packages/web/src/terminal/terminal-resize.ts` - ResizeObserver + 200ms backend resize debounce pipeline.
- `packages/web/src/terminal/terminal-view.tsx` - xterm lifecycle integration with resize hook and fit addon references.
- `packages/web/src/components/ConnectionOverlay.tsx` - disconnected/reconnecting messaging while preserving selection/copy behavior.
- `packages/server/src/server/session.ts` - robust rows/cols handling on attach-driven resize.
- `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` - resize continuity regression test for streamed output.

## Decisions Made
- Use redraw-first reconnect behavior for same-tab reconnects to prefer correctness over incremental replay complexity.
- Keep disconnected overlays non-interactive (`pointer-events-none`) so terminal text remains selectable while transport recovers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Repo-wide `npm run typecheck` remains memory-constrained in this environment; task verification used `npm run typecheck --workspace=@oisin/web` plus full terminal e2e coverage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TERM-02, TERM-03, and TERM-04 reliability guarantees for the active-thread placeholder terminal are in place.
- Ready to proceed to Phase 3 thread/project routing on top of stable reconnect and resize semantics.

---
*Phase: 02-terminal-i*
*Completed: 2026-02-22*
