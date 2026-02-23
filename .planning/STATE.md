# State: Oisin UI

## Project Reference

**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current Focus:** Phase 2 terminal reliability + interactivity smoke gate complete; ready to begin multi-project thread management.
**Config:** standard depth · yolo mode · parallel execution

## Current Position

**Phase:** 02 of 4 (Terminal I/O)
**Plan:** 05 of 05
**Status:** Phase complete.
**Last activity:** 2026-02-23 - Completed 02-terminal-i-05-PLAN.md

```
Progress: [████████████████████] 100%
Phase 1:  ██████████ Complete
Phase 2:  ██████████ Complete
Phase 3:  ░░░░░ Not Started
Phase 4:  ░░░░░ Not Started
```

## Performance Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Plans executed         | 11    |
| Plans passed           | 11    |
| Plans failed           | 0     |
| Total requirements     | 11    |
| Requirements complete  | 10    |
| Requirements remaining | 1     |

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

### Blockers

| Blocker | Impact | Status |
| ------- | ------ | ------ |
| Repo-wide `npm run typecheck` can OOM in this environment | Full monorepo typecheck is not reliable for verification in this shell | Ongoing environment issue; workspace-level typechecks and e2e coverage used for plan execution |

## Session Continuity

**Last session:** 2026-02-22 18:13 PST
**Stopped at:** Completed 02-terminal-i-05-PLAN.md
**Resume file:** None

---

_State initialized: 2026-02-21_
_Last updated: 2026-02-23T02:13:05Z_
