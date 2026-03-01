# State: Oisin UI

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-02-28)

**Core value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current focus:** v2 Code Review — hunk-level staging/unstaging and commit from browser.

## Current Position

**Milestone:** v2 Code Review
**Phase:** Phase 09 — diff-panel-redesign (in progress)
**Plan:** 09-03 complete
**Status:** In progress
**Last activity:** 2026-03-01 — Completed 09-03: staged/unstaged split in daemon + schema + web types

```
v1:   [████████████████████] 100% (5/5 phases) — shipped 2026-02-25
v1.1: [████████████████████] 100% (3/3 phases) — shipped 2026-02-28
v2:   [████░░░░░░░░░░░░░░░░]  ~20% — 09-01 + 09-02 + 09-03 complete
```

## Accumulated Context

### Completed Milestone

- v1 (phases 01-05) shipped and archived.
- All 11 v1 requirements closed.
- Runtime verification closure complete with restart + runtime evidence gates.

### v2 Scope Decisions

- DIFF-02/03/04 are the v2 focus. TERM-05 and REMO-01/02 deferred.
- Diff panel keeps toggle behaviour (not always-visible column).
- Hunk staging: inline "Stage hunk" / "Unstage hunk" button per hunk (not per-file checkbox).
- Target layout: two-column (file list left with +/- stats + tabs, diff viewer right) + commit bar at bottom.
- Reference UI: Superset.sh "See Changes" panel.

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
  - VER-02 browser e2e: create->click-switch->delete test uses sidebar row click (not keyboard); daemon-killing tests must be last in shared-runtime suites.
  - VER-01 diff-panel: thread created via controlClient.createThread() in beforeAll (worktreePath synchronous); git mv required for staged rename detection (R100 status); main > header scopes toggle button away from diff-panel's internal header.
  - terminal-manager env tests: use time-bounded retry loop (send command every 200ms until file appears) with 25s/40s timeouts to handle shell startup latency under parallel test load.
- 09-01: `baseUrl` removed from tsconfig — TS5.x supports `paths` without it; eliminates oxlint tsgolint false positive.
- 09-01: `payload?: any` in SessionMessage kept with eslint-disable — WS payload is genuinely dynamic; `unknown` would require 50+ type assertions.
- 09-03: `structured` kept as `[...stagedFiles, ...unstagedFiles]` union for backward compat; `stagedFiles`/`unstagedFiles` optional in schema (older daemons won't send them); web defaults to `[]`.
- 09-03: `getNumstatByPath` replaces `getTrackedNumstatByPath` with variadic args to support `--cached`, no-ref, and ref-based numstat.

## Session Continuity

**Last session:** 2026-03-01
**Stopped at:** Completed 09-03-PLAN.md
**Resume file:** None

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Add oxlint/oxfmt/shadcn-enforcer/AGENTS.md to web package | 2026-02-28 | 4726a8d | [001-add-oxlint-oxfmt-shadcn-enforcer-plugin](./quick/001-add-oxlint-oxfmt-shadcn-enforcer-plugin/) |

---

_State updated: 2026-03-01 — Phase 09 plan 03 complete. Staged/unstaged split added to daemon getCheckoutDiff; propagated through message schema, session, and web diff-store types._
