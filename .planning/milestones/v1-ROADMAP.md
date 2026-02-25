# Milestone v1: MVP

**Status:** ✅ SHIPPED 2026-02-25
**Phases:** 01-05
**Total Plans:** 34

## Overview

v1 shipped a Docker-first, self-hosted web UI for managing coding-agent terminal sessions across projects and threads, with per-thread git worktrees, reconnect-safe terminal I/O, and per-thread diff review. The milestone closed with runtime verification gates proving browser WebSocket connectivity, tmux runtime presence, restart stability, and clean stop/no-orphan behavior.

## Phases

### Phase 1: Foundation & Docker

**Goal**: A running daemon serves a web client inside Docker, and they can talk to each other.
**Depends on**: None
**Plans**: 6 plans

Plans:

- [x] 01-01: Project bootstrap and codebase cleanup
- [x] 01-02: Daemon simplification
- [x] 01-03: Web client scaffold
- [x] 01-04: Docker configuration
- [x] 01-05: Client-daemon connection flow
- [x] 01-06: Dynamic WebSocket URL

**Details:**
- Stripped Paseo to a focused daemon+web scope.
- Established Docker runtime and browser/daemon connectivity baseline.

### Phase 2: Terminal I/O

**Goal**: Users can interact with a live terminal session in the browser that survives disconnects.
**Depends on**: Phase 1
**Plans**: 7 plans

Plans:

- [x] 02-01: tmux-authoritative terminal backend and bootstrap
- [x] 02-02: xterm UI and binary stream wiring
- [x] 02-03: Reconnect recovery, resize sync, reliability coverage
- [x] 02-04: Concurrent ensure bootstrap race closure
- [x] 02-05: WS endpoint alignment and interactivity smoke gate
- [x] 02-06: Reconnect attach stream-id invalidation and input gating
- [x] 02-07: Reconnect/refresh + reconnect+resize stale-stream regression gate

**Details:**
- Delivered reconnect-safe, stream-id-aware terminal attach flow.
- Locked reliability with daemon/browser regression coverage.

### Phase 3: Project & Thread Management

**Goal**: Users can manage multiple projects and threads, each with isolated worktrees and terminal sessions.
**Depends on**: Phase 2
**Plans**: 9 plans

Plans:

- [x] 03-01: Canonical project registry and thread persistence foundation
- [x] 03-02: Server thread lifecycle orchestration
- [x] 03-03: Sidebar and thread dialogs UX wiring
- [x] 03-04: Session reaper and regression coverage
- [x] 03-05: Base branch + command override gap closure
- [x] 03-06: Bun-lockfile worktree bootstrap compatibility
- [x] 03-07: Frozen-lock retry strategy for create-thread flow
- [x] 03-08: Workspace command compatibility closure
- [x] 03-09: Create-thread pending leak closure

**Details:**
- Delivered project/thread lifecycle with worktree + terminal isolation.
- Closed operational create-thread failures and pending-state hangs.

### Phase 4: Code Diffs

**Goal**: Users can review uncommitted code changes per thread without leaving the browser.
**Depends on**: Phase 3
**Plans**: 6 plans

Plans:

- [x] 04-01: Server diff contracts and git-order alignment
- [x] 04-02: Thread-scoped diff store and subscription lifecycle
- [x] 04-03: Desktop/mobile diff panel shells and persisted resize
- [x] 04-04: diff2html rendering and browser regressions
- [x] 04-05: Git-order payload regression closure
- [x] 04-06: Rename metadata and syntax-highlight fidelity closure

**Details:**
- Delivered per-thread diff rendering with structured payloads.
- Closed rename/highlight fidelity gaps with regression checks.

### Phase 5: Docker Runtime Verification Closure

**Goal**: Close DOCK-01 runtime verification gate for milestone closure.
**Depends on**: Phases 1-4 complete
**Plans**: 6 plans

Plans:

- [x] 05-01: Runtime evidence capture and WS checkpoint
- [x] 05-02: Verification docs and milestone audit closure
- [x] 05-03: Runtime stabilization and deterministic evidence regeneration
- [x] 05-04: Verification and milestone pass-state propagation
- [x] 05-05: Duplicate-daemon runtime-gate fix and deterministic refresh
- [x] 05-06: Startup/restart stale-lock recovery and websocket stability proof

**Details:**
- Closed runtime verification with browser-origin WS 101, tmux-live, and no-orphan proofs.
- Added restart-stability gate and hardened PID-lock ownership logic.

---

## Milestone Summary

**Decimal Phases:**

- None.

**Key Decisions:**

- Keep terminal/websocket lifecycle outside React component ownership.
- Use tmux-authoritative terminal model with stream-id-safe reconnect attach.
- Use configured project registry (`projects.repositories`) as canonical project source.
- Keep thread/worktree lifecycle centralized in server orchestration service.
- Preserve git-order structured diff payloads through server and web adapters.
- Treat DOCK-01 closure as evidence-gated with restart and runtime proofs.

**Issues Resolved:**

- Create-thread failures from lockfile/workspace bootstrap mismatches.
- Create-thread pending leaks during disconnected/no-response paths.
- Docker restart churn from stale PID lock ownership ambiguity.

**Issues Deferred:**

- Ensure-default metadata extension (`projectId`/`resolvedThreadId`) not fully emitted in current response path.
- Diff-panel browser regression can skip when no active-thread fixture exists.

**Technical Debt Incurred:**

- Some terminal test diagnostics and compatibility placeholders remain and should be cleaned in next milestone.

---

_For current project status after v1 closure, see `.planning/ROADMAP.md`._
