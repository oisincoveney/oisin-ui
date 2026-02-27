# State: Oisin UI

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-02-25)

**Core value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current focus:** Phase 07 - Thread Contract Completion (v1.1).

## Current Position

**Phase:** 07 of 08 (Thread Contract Completion)
**Plan:** 1 of 2 in current phase
**Status:** In progress
**Last activity:** 2026-02-27 — Completed 07-01-PLAN.md

```
Progress: [███████████████░░░░░] 75.0% (6/8 phases complete)
```

## Accumulated Context

### Completed Milestone

- v1 (phases 01-05) shipped and archived.
- All 11 v1 requirements closed.
- Runtime verification closure complete with restart + runtime evidence gates.

### Open Follow-ups for Next Milestone

- ~~Ensure-default metadata contract completion~~ (done in 07-01).
- Deterministic diff-panel browser regression fixture (avoid skip path).

### Decisions Logged

- RUN-02 input durability uses bounded FIFO queue (`maxBytes`/`maxChunks`/`ttlMs`) with oldest-first eviction.
- Queued terminal input flushes only after attach confirmation and is cleared on unsafe live stream invalidation/switch.
- RUN-03 create failures now use a typed dialog contract (`summary`, `details`, `copyText`, `requestId`) instead of flat strings.
- RUN-03 bootstrap failures surface concise summary text with expandable raw diagnostics retained for copy/retry.
- RUN-03 create pending lifecycle must clear on send failure, timeout boundary, response, and store teardown.
- RUN-02 attach recovery now uses explicit `idle/retrying/failed` FSM with hard 60s deadline.
- Reconnect success signaling is token-deduped so `Reconnected` toast emits once per recovery cycle.
- Attach recovery retry state is visible in connected mode (attempt + remaining window + last error).
- RUN-04 active delete success is an explicit neutral state; do not auto-fallback to another thread.
- Delete-driven no-active state is preserved across thread-list/ensure-default updates until explicit user selection.
- Active-thread-null transitions invalidate attach cycle guards and cancel stale pending attach/ensure retries.
- Restart detection now keys off `status.server_info.serverId` identity change, not websocket transport state alone.
- Warm-up locks create/switch/delete until both thread refresh and attach settle complete.
- Restart recovery restores prior active thread if present, else falls back to newest thread by `updatedAt`.
- Restart attach-retry UI regressions are driven deterministically by requestId-matched synthetic attach error responses in browser e2e.
- Active-delete no-active-thread regression should use UI-created, test-owned threads to avoid ambient runtime state flake.
- Phase runtime verification is a single deterministic command chain (typecheck + daemon e2e + web e2e) mapped directly to RUN-01..RUN-04.
- Websocket connect now binds inbound handling immediately and queues earliest messages until session dispatch is ready, then drains in-order through normal request handling.
- Claude provider availability probing is async and cached (no constructor-time sync shell checks on session startup path).
- Daemon e2e now asserts first post-connect `fetchAgents` reliability with bounded latency across repeated fresh connections.
- First-RPC safety now has an explicit `waitForPostConnectReady` barrier; daemon test context must await it before initial `fetchAgents`.
- First-request regression now validates readiness + immediate ping/fetchAgents bounded latency across repeated fresh connections.
- Phase verification evidence must come from one concrete passing command chain run (typecheck -> daemon e2e -> web e2e).
- threadScope relaxed from z.literal to z.string() for backward compat; projectId/resolvedThreadId now required-nullable in ensure-default schema.

## Session Continuity

**Last session:** 2026-02-27T23:08:21Z
**Stopped at:** Completed 07-01-PLAN.md
**Resume file:** None

---

_State updated: 2026-02-27 after 07-01 execution_
