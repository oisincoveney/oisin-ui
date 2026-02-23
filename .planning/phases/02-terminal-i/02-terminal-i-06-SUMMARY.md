---
phase: 02-terminal-i
plan: 06
subsystem: terminal
tags: [websocket, terminal, reconnect, stream-id, state-machine]
requires:
  - phase: 02-05
    provides: ws/attach diagnostics and browser terminal interactivity baseline
provides:
  - reconnect-cycle stream identity invalidation before attach retries
  - attach-confirmed input gating bound to the active terminal stream id
  - deterministic server stale-stream rejection with attach lifecycle diagnostics
affects: [phase-02-uat, 02-07-regression-gate, phase-03-thread-routing]
tech-stack:
  added: []
  patterns:
    - reconnect-cycle correlated attach acceptance
    - adapter-level stream rollover reset plus attach-confirmed input enablement
    - server-side stale stream diagnostics without fallback routing
key-files:
  created: []
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/terminal/terminal-stream.ts
    - packages/server/src/server/session.ts
key-decisions:
  - "Invalidate client stream identity on every reconnect transition and before each attach attempt so stale stream ids can never stay sendable."
  - "Gate terminal input on attach-confirmed active stream id in the adapter instead of trusting transport connection state alone."
  - "Keep server fail-fast rejection for stale stream input, but enrich diagnostics with detached-stream lifecycle context."
patterns-established:
  - "Reconnect safety pattern: reset stream identity immediately, then re-enable input only on matching attach response for current cycle."
  - "Lifecycle diagnostics pattern: log stale stream replays with terminal id and current stream id for rapid drift triage."
duration: 2 min
completed: 2026-02-23
---

# Phase 2 Plan 6: Reconnect Stream Identity Hardening Summary

**Reconnect/refresh churn now hard-resets terminal stream identity, blocks input until latest attach confirmation, and keeps server stale-stream rejection deterministic with lifecycle-aware diagnostics.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T03:46:35Z
- **Completed:** 2026-02-23T03:48:34Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Refactored web reconnect orchestration in `packages/web/src/App.tsx` to invalidate active stream identity immediately on disconnect/reconnect and correlate ensure/attach responses to reconnect cycle id.
- Strengthened `packages/web/src/terminal/terminal-stream.ts` so input sends only when transport is connected and the adapter has an attach-confirmed active stream id; added explicit stream rollover reset and attach confirmation methods.
- Updated `packages/server/src/server/session.ts` to reject stale stream input deterministically against current terminal->stream bindings and include detached-stream lifecycle diagnostics without permissive fallback routing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Invalidate stream identity immediately on disconnect/reconnect transitions** - `08ceaa5` (fix)
2. **Task 2: Gate terminal input in stream adapter on active attached stream confirmation** - `2515205` (feat)
3. **Task 3: Align server stale-stream rejection with reconnect attach lifecycle diagnostics** - `9726f4f` (fix)

**Plan metadata:** recorded in execution docs commit for this plan

## Files Created/Modified
- `packages/web/src/App.tsx` - adds reconnect-cycle correlation and stream-state invalidation before ensure/attach re-entry.
- `packages/web/src/terminal/terminal-stream.ts` - introduces stream rollover reset/attach-confirm APIs and stream-bound input gating.
- `packages/server/src/server/session.ts` - hardens stale stream input rejection with detached stream lifecycle tracking.

## Decisions Made
- Reconnect transitions must invalidate stream identity immediately and keep it invalid until the newest attach response for the current cycle is accepted.
- Stream adapter input eligibility must be tied to attach-confirmed active stream id, not transport connectivity alone.
- Server must keep fail-fast stale-stream rejection while surfacing lifecycle context to make stream-id drift diagnostics actionable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap-closure hardening is in place for reconnect stream-id drift and stale post-reconnect input routing.
- Ready for `02-07-PLAN.md` reconnect/refresh and reconnect+resize regression gate validation.

---
*Phase: 02-terminal-i*
*Completed: 2026-02-23*
