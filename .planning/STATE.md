# State: Oisin UI

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-02-28)

**Core value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current focus:** v2 Code Review milestone complete — file staging and commit from browser delivered.

## Current Position

**Milestone:** v2 Code Review
**Phase:** Phase 11 of 11 — hunk-staging-commit
**Plan:** 11-02 of 2 complete
**Status:** Milestone complete
**Last activity:** 2026-03-02 — Completed 11-02: Frontend stage/unstage + commit workflow wiring

```
Plans: [████████████████████] 100% (64/64)
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
- Target layout: accordion/collapsible — "Staged (N)" and "Unstaged (N)" sections with inline diff expansion; commit bar at bottom. No two-column layout, no tabs, no right-pane viewer.
- Reference UI: Superset.sh "See Changes" panel (accordion pattern adopted, not two-column).

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
- 09-04: DiffMobileSheet kept with `files[]` (combined array) — out of scope; CollapsibleTrigger `asChild` removed (base-ui has no asChild).
- 09-05: Regex matchers `/^Staged \(\d+\)/` used in e2e assertions — count-agnostic, matches any N.
- 09-10: `subscribe_checkout_diff_request` now carries optional `projectId`/`threadId`; older clients remain compatible.
- 09-10: `resolveValidDiffCwd` now performs hinted project-scoped fallback before global project iteration to preserve per-thread diff isolation.
- 09-11: terminal rehydrate validates `thread.links.worktreePath` before `ensureThreadTerminal`, falling back to project `repoRoot` when missing.
- 09-11: recovered fallback cwd is persisted to `thread.links.worktreePath` to prevent repeated stale-path rehydrate loops.
- 09-11: tmux session bootstrap kills stale thread session when requested cwd is missing before `has-session` short-circuit.
- 10-01: Thread registry persistence foundation uses SQLite (`sqlite` + `sqlite3`) with `initDb`/`getDb` typed accessor in `db.ts`.
- 10-01: Database init enforces `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` on startup.
- 10-01: `threads.status` constrained to `idle|running|error|closed`, `worktree_path` is NOT NULL, and `project_id` FK cascades delete from `projects`.
- 10-01: `sessionKey` and `agentId` remain runtime-only (not persisted in DB schema).
- 10-02: ThreadRegistry persistence is now SQLite-backed with existing public interface and caller compatibility preserved.
- 10-02: Thread creation persists directly as `idle`; `unknown` status removed and lifecycle fallback maps to `error`.
- 10-02: Runtime-only `agentId`/`sessionKey` linkage is maintained in memory maps over DB-backed thread rows.
- 10-03: Startup reconciliation is one-shot and orphan-only: delete worktrees on disk with no matching `threads` row.
- 10-03: Reconciliation is DB read + filesystem cleanup only; it does not mutate `threads` rows.
- 10-03: Per-worktree deletion failures are warning-only to keep reconciliation progressing across projects.
- 10-04: Bootstrap startup order is now `initDb()` before ThreadRegistry wiring, then `runStartupReconciliation()` before server listen.
- 10-04: Session reaper runtime path is fully removed; no `ThreadSessionReaper` references remain in `packages/server/src`.
- 10-04: Thread switch validates `thread.links.worktreePath` with `fs.access()` before terminal ensure; missing path marks thread `error` and throws.
- 10-05: ThreadRegistry tests now exercise SQLite-backed create/delete/switch/active/lookup paths using `:memory:` DB isolation.
- 10-05: Startup reconciliation tests validate orphan cleanup and non-crashing behavior via real git worktree fixtures under `bun test`.
- 11-01: checkout stage/unstage now use dedicated request/response schemas in session inbound/outbound unions.
- 11-01: Unstage operation uses `git reset HEAD -- <path>` to support newly staged files not present in `HEAD`.
- 11-02: commit form now resolves from `checkout_commit_response` so failures preserve message and surface toast feedback.
- 11-02: DiffFileSection stage controls are callback-gated/optional so desktop diff panel gets stage actions without broad mobile sheet API changes.

## Session Continuity

**Last session:** 2026-03-02 22:23 UTC
**Stopped at:** Completed 11-02-PLAN.md
**Resume file:** None

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Add oxlint/oxfmt/shadcn-enforcer/AGENTS.md to web package | 2026-02-28 | 4726a8d | [001-add-oxlint-oxfmt-shadcn-enforcer-plugin](./quick/001-add-oxlint-oxfmt-shadcn-enforcer-plugin/) |
| 002 | Refactor app sidebar to use pure ShadCN structure | 2026-03-02 | 73362d7 | [002-refactor-app-sidebar-to-use-pure-shadcn-stru](./quick/002-refactor-app-sidebar-to-use-pure-shadcn-stru/) |
| 003 | Fix pure ShadCN sidebar layout | 2026-03-02 | 066e5e0 | [003-fix-pure-shadcn-sidebar-layout](./quick/003-fix-pure-shadcn-sidebar-layout/) |

---

_State updated: 2026-03-02 — Completed Phase 11. v2 Code Review milestone complete._
