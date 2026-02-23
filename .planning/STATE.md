# State: Oisin UI

## Project Reference

**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current Focus:** Phase 3 web thread UX complete (external store + sidebar/dialog flows + attach rebind + keyboard switching); ready for reaper/e2e hardening.
**Config:** standard depth · yolo mode · parallel execution

## Current Position

**Phase:** 03 of 4 (Project & Thread Management)
**Plan:** 03 of 04
**Status:** In progress.
**Last activity:** 2026-02-23 - Completed 03-project-and-thread-management-03-PLAN.md

```
Progress: [███████████████████░] 94%
Phase 1:  ██████████ Complete
Phase 2:  ██████████ Complete
Phase 3:  ████░ In Progress (3/4)
Phase 4:  ░░░░░ Not Started
```

## Performance Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Plans executed         | 16    |
| Plans passed           | 16    |
| Plans failed           | 0     |
| Total requirements     | 11    |
| Requirements complete  | 5     |
| Requirements remaining | 6     |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
| -------- | --------- | ----- |
| Keep WebSocket lifecycle outside React components | Prevent duplicate sockets and preserve reconnect semantics across rerenders | 01-05 |
| Build client WS URL from browser location + daemon port env | Allow LAN/container access without localhost assumptions | 01-06 |
| Use redraw-first reconnect flow with resume fallback | Guarantees terminal correctness after socket drops and stale offsets | 02-03 |
| Keep overlay pointer events disabled while disconnected | Preserve terminal text selection/copy during reconnect windows | 02-03 |
| Debounce resize propagation while fitting immediately in UI | Avoid tmux jitter while keeping streamed output uninterrupted | 02-03 |
| Correlate default terminal ensure by requestId + single-flight server ensure | Prevent bootstrap races from churning terminal IDs and breaking attach/input routing | 02-04 |
| Standardize daemon/web default endpoint on port 6767 with startup env propagation | Remove ws attach drift between runtime defaults and web fallback resolution | 02-05 |
| Disable speech providers in terminal smoke runtime | Keep e2e startup deterministic by avoiding local model bootstrap delays | 02-05 |
| Invalidate stream identity on reconnect transitions and accept attach responses only for active reconnect cycle | Prevent stale streamId reuse after reconnect/refresh churn | 02-06 |
| Gate adapter input on attach-confirmed active stream and keep server stale-stream rejection lifecycle-aware | Ensure post-reconnect input routes only to latest stream without permissive fallback | 02-06 |
| Exercise reconnect/refresh and reconnect+resize via deterministic client churn regressions with stale-stream warning assertions | Keep UAT stream-id drift and resize continuity blockers permanently covered by e2e gate | 02-07 |
| Use `projects.repositories` in persisted daemon config as canonical configured project source | Guarantees deterministic sidebar project source across restarts and avoids transient agent-derived drift | 03-01 |
| Persist thread identity in `$PASEO_HOME/thread-registry.json` with atomic temp-write + rename | Ensures durable project/thread metadata and minimizes corruption risk on write interruption | 03-01 |
| Keep legacy ensure-default terminal placeholder fields while adding additive concrete identity fields | Preserves existing client bootstrap compatibility during Phase 3 contract migration | 03-01 |
| Centralize thread create/switch/delete in a dedicated lifecycle service | Keeps rollback and cleanup behavior deterministic and testable across session handlers | 03-02 |
| Require explicit `forceDirtyDelete=true` when deleting dirty thread worktrees | Prevents accidental data loss while still allowing intentional destructive cleanup | 03-02 |
| Keep thread/session UI state in an external store exposed through `useSyncExternalStore` hooks | Preserves websocket lifecycle separation from component rerender churn while enabling sidebar/dialog orchestration | 03-03 |
| Rebind terminal stream by active thread terminal identity and keep previous thread running | Satisfies background-alive switching and maintains Phase 2 attach/input safety guarantees | 03-03 |
| Require second destructive confirmation in delete dialog when dirty-worktree error is returned | Prevents accidental deletion of uncommitted work while still permitting explicit forced cleanup | 03-03 |

### Blockers

| Blocker | Impact | Status |
| ------- | ------ | ------ |
| Repo-wide `npm run typecheck` can OOM in this environment | Full monorepo typecheck is not reliable for verification in this shell | Ongoing environment issue; workspace-level typechecks and e2e coverage used for plan execution |

## Session Continuity

**Last session:** 2026-02-23 06:56 PST
**Stopped at:** Completed 03-project-and-thread-management-03-PLAN.md
**Resume file:** None

---

_State initialized: 2026-02-21_
_Last updated: 2026-02-23T14:56:24Z_
