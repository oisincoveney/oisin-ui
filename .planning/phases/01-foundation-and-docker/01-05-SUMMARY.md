---
phase: 01-foundation-and-docker
plan: 05
subsystem: ui
tags: [effect, websocket, reconnect, vite, react]

requires:
  - phase: 01-foundation-and-docker
    plan: 04
    provides: 'Docker environment and daemon process startup accessible from the web container'
  - phase: 01-foundation-and-docker
    plan: 03
    provides: 'Vite + React workspace with Effect TS and shared UI foundations'
provides:
  - 'Effect-driven WebSocket client for daemon connectivity with reconnect and heartbeat handling'
  - 'Reactive connection status (`connecting`, `connected`, `disconnected`) exposed to React UI'
  - 'Connection overlay and indicator states that block input during reconnect windows'
affects:
  - '02-01'
tech-stack:
  added: []
  patterns:
    - 'Use module-level Effect `Ref` state for shared connection lifecycle outside individual React renders'
    - 'Expose socket state via a small subscription hook (`useConnectionStatus`)'
    - 'Render full-screen connection overlays for loading and reconnecting states in the web UI'
key-files:
  created:
    - .dockerignore
  modified:
    - packages/web/src/lib/ws.ts
    - packages/web/src/App.tsx
    - packages/web/src/components/ConnectionOverlay.tsx
key-decisions:
  - 'Keep connection management outside React component state to avoid duplicate socket creation during re-renders'
  - 'Use an always-visible overlay during connect/disconnect states to prevent command input confusion'
  - 'Use exponential backoff with infinite retries to keep reconnection behavior resilient in unstable environments'
patterns-established:
  - 'Effect-based client state shared across hooks using shared subscriptions'
  - 'Status-driven UI states for transport stability in the terminal shell'
---

# Phase 01 Plan 05: Client-Daemon Connection Flow

**Implemented effect-based WebSocket lifecycle with exponential reconnection and transport-aware UI overlays that indicate connect, disconnect, and recovered connection states before moving to terminal session features**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T23:08:00Z
- **Completed:** 2026-02-21T23:10:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Implemented a shared WebSocket client in `packages/web/src/lib/ws.ts` with explicit state tracking (`connecting`, `connected`, `disconnected`), heartbeat handling via ping/pong, infinite exponential reconnect, and effect-safe lifecycle control.
- Added `ConnectionOverlay` states in `packages/web/src/components/ConnectionOverlay.tsx` for a spinner on initial connect and a full-screen reconnect overlay to disable input while waiting for recovery.
- Wired connection status into `packages/web/src/App.tsx` with a persistent green/red dot indicator and status label that updates as transport state changes.

## Task Commits

1. **Task 1: Effect-based WebSocket Client** - `d069a48` (`feat`)
2. **Task 1 follow-up fix: WebSocket endpoint and dockerignore** - `1d5b80e` (`fix`)
3. **Task 2: Connection Status UI** - `5b4f780` (`feat`)
4. **Task 3: Full stack Docker environment and Web UI connection resilience verification** - no code commit (human-verified checkpoint completed)

## Files Created/Modified

- `packages/web/src/lib/ws.ts` - effect-backed WebSocket client with reconnect scheduler, ping/pong support, and shared status subscription API.
- `packages/web/src/components/ConnectionOverlay.tsx` - full-screen states for connecting and reconnecting/disconnected transport phases.
- `packages/web/src/App.tsx` - status indicator in main layout and overlay integration for live status rendering.
- `.dockerignore` - excludes workspace and local tooling directories from Docker build context.

## Decisions Made

- Keep websocket URL constant as `ws://localhost:3000/ws?clientSessionKey=web-client` to match current daemon connection contract.
- Centralize connection state in module-level refs and expose subscribers via a lightweight `useConnectionStatus` hook.
- Prefer user-safe transport UX: show overlays for non-connected states instead of allowing hidden partial terminal behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected websocket endpoint and Docker build context config**

- **Found during:** Task 1
- **Issue:** Initial client target endpoint needed the daemon's websocket route and container build context should exclude local-only state directories.
- **Fix:** Updated `WS_URL` to `ws://localhost:3000/ws?clientSessionKey=web-client` and added `.dockerignore` to prevent packaging of non-build directories.
- **Files modified:** `.dockerignore`, `packages/web/src/lib/ws.ts`
- **Verification:** Reconnect behavior remained working and Docker verification steps were passed during checkpoint approval.
- **Committed in:** `1d5b80e`

## Issues Encountered

- No blocking issues during execution.
- Full stack verification of connect/reconnect behavior was completed via checkpoint approval and external validation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01 is now complete.
- Phase 2 (Terminal I/O) can begin with terminal streaming and input wiring using the stable transport primitives now in place.

---

_Phase: 01-foundation-and-docker_
_Completed: 2026-02-21_
