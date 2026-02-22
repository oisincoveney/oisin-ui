# State: Oisin UI

## Project Reference

**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current Focus:** Phase 1 complete; moving to terminal I/O bootstrap.
**Config:** standard depth · yolo mode · parallel execution

## Current Position

**Phase:** 01 (Foundation & Docker)
**Plan:** 06 of 6
**Status:** Phase complete.

```
Progress: [████████████████████] 100%
Phase 1:  ██████████ Complete
Phase 2:  ░░░░░ Not Started
Phase 3:  ░░░░░ Not Started
Phase 4:  ░░░░░ Not Started
```

## Performance Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Plans executed         | 6     |
| Plans passed           | 6     |
| Plans failed           | 0     |
| Total requirements     | 11    |
| Requirements complete  | 6     |
| Requirements remaining | 5     |

## Accumulated Context

### Key Decisions

| Decision                                                                                         | Rationale                                                                                         | Phase        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------ |
| Fork Paseo, strip to daemon + web client                                                         | Core architecture sound, problems fixable. ~40-50% daemon reusable.                               | Pre-phase    |
| Expo → Vite + React                                                                              | Web-only, no mobile overhead, faster builds                                                       | Phase 1      |
| tmux for session persistence                                                                     | Agents survive daemon restarts, browser disconnects                                               | Phase 2      |
| Terminal-first (no ACP)                                                                          | Gets all CLI agents for free, no protocol reimplementation                                        | Architecture |
| Docker with tini as PID 1                                                                        | Proper signal propagation for multi-process container                                             | Phase 1      |
| Use `node:22-bookworm` + `tini` to run daemon and web in one container with signal-safe shutdown | Simplified local deployment and orphan cleanup for process lifecycle                              | Plan 01-04   |
| Remove app/desktop/website/relay from workspace                                                  | Keeps bootstrap monorepo minimal and aligned with new direction                                   | Phase 01     |
| Rewrite README to Oisin identity                                                                 | Ensures project documentation reflects final scope                                                | Phase 01     |
| Honor `PORT` for daemon listen config with `3000` fallback                                       | Keeps localhost defaults aligned with task objective while remaining configurable                 | Plan 01-02   |
| Keep bootstrap server composition and attach WS heartbeat at transport layer                     | Avoids unnecessary architecture churn while adding required lifecycle behavior                    | Plan 01-02   |
| Add `packages/web` as a Vite + React workspace in root workspaces                                | Gives a production-ready web-first client foundation without mobile/runtime complexity            | Plan 01-03   |
| Use ESM-safe Tailwind + ShadCN foundation files in web workspace                                 | Enables styled default page and future component work to proceed without blocking CLI assumptions | Plan 01-03   |
| Keep WebSocket state outside component lifecycle                                                 | Avoid duplicate socket creation and preserve reconnect behavior across re-renders                 | Plan 01-05   |
| Add full-screen connection overlays                                                              | Prevent user interaction while transport is reconnecting, improving state safety                  | Plan 01-05   |
| Build the client WebSocket URL from browser location + optional daemon port env var              | Makes UI connect from LAN hostnames and non-localhost container IPs without DNS issues            | Plan 01-06   |

### Research Insights

- **~40-50% of Paseo daemon reusable**: terminal manager, binary mux, daemon-client SDK, worktree utils
- **Key libs**: @xterm/xterm v6, reconnecting-websocket, diff2html, node-pty, simple-git
- **Critical pitfalls**: WebSocket state recovery, terminal dimension desync, orphaned tmux sessions, Docker PID 1 signals
- **Phase 2 light research needed**: xterm.js + tmux attachment specifics
- **Phase 4 light research needed**: diff2html integration patterns

### Todos

- [x] Execute `01-01-PLAN.md`
- [x] Execute `01-02-PLAN.md`
- [x] Execute `01-03-PLAN.md`
- [x] Execute `01-04-PLAN.md`
- [x] Execute `01-05-PLAN.md`
- [x] Execute `01-06-PLAN.md`

### Blockers

| Blocker                                                                                  | Impact                                                                          | Status                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Missing `@getpaseo/relay/e2ee` typing and esbuild optional binary in current environment | Prevented typecheck and live server smoke test from passing in this environment | Unrelated to plan scope, to be handled before full verification |

## Session Continuity

### Last Session

**Date:** 2026-02-22
**What happened:** Updated WebSocket URL derivation to use browser hostname and protocol with configurable daemon port, enabling non-localhost access to the running container web UI.
**Where we stopped:** Plan 01-06 (`01-06-PLAN.md`) completed.

### Next Session Entry Point

No follow-up plan exists in `.planning/phases` yet; ready to create/execute Phase 2 next.

---

_State initialized: 2026-02-21_
_Last updated: 2026-02-22T01:41:13Z_
