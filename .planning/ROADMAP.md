# Roadmap: Oisin UI

**Created:** 2026-02-21
**Depth:** Standard
**Phases:** 4
**Coverage:** 11/11 v1 requirements mapped

## Overview

Oisin UI delivers a self-hosted web terminal for managing AI coding agents across projects and threads. The roadmap follows a strict dependency chain: Docker + daemon foundation → terminal I/O (the core product) → multi-project thread management → code diffs. Each phase produces a usable increment — after Phase 2, you have a working terminal-in-a-browser; after Phase 3, the multi-thread agent workflow; after Phase 4, a complete local development tool.

## Phases

### Phase 1: Foundation & Docker

**Goal:** A running daemon serves a web client inside Docker, and they can talk to each other.

**Dependencies:** None (starting point)

**Plans:** 6 plans

- [x] 01-01-PLAN.md — Project Bootstrap & Codebase Cleanup
- [x] 01-02-PLAN.md — Daemon Simplification
- [x] 01-03-PLAN.md — Web Client Scaffold
- [x] 01-04-PLAN.md — Docker Configuration
- [x] 01-05-PLAN.md — Client-Daemon Connection Flow
- [x] 01-06-PLAN.md — Dynamic WebSocket URL

**Requirements:**

- DOCK-01: Application runs in a single Docker container (daemon + web UI + tmux)

**Success Criteria:**

1. User can `docker build` and `docker run` a single container that starts the daemon and web UI
2. User opens the web UI in a browser and sees a connected status indicator (WebSocket handshake succeeds)
3. User can stop the container with Ctrl+C and all child processes (tmux, node) terminate cleanly (no orphans)

**Key Work:**

- Fork Paseo, strip Expo/mobile/voice/Tauri/desktop/website
- Simplify daemon bootstrap to Express + WS + core managers
- Scaffold Vite + React web app (replaces Expo)
- Dockerfile with `tini` as PID 1, tmux + git installed, proper signal handling
- Basic WebSocket connection between client and daemon with connection status display

**Research Flags:** None — well-documented patterns, Paseo codebase is the reference.

---

### Phase 2: Terminal I/O

**Goal:** Users can interact with a live terminal session in the browser that survives disconnects.

**Dependencies:** Phase 1 (daemon + web client + Docker running)

**Plans:** 7 plans

- [x] 02-01-PLAN.md — tmux-authoritative terminal backend and default session bootstrap
- [x] 02-02-PLAN.md — xterm terminal UI and binary stream wiring in the web client
- [x] 02-03-PLAN.md — reconnect recovery, resize sync, and reliability coverage
- [x] 02-04-PLAN.md — concurrent ensure bootstrap race closure
- [x] 02-05-PLAN.md — ws endpoint alignment, attach diagnostics, and browser interactivity smoke gate
- [x] 02-06-PLAN.md — reconnect attach stream-id invalidation and input gating hardening
- [x] 02-07-PLAN.md — reconnect/refresh plus reconnect+resize stale-stream regression gate

**Requirements:**

- TERM-01: User can interact with a terminal session embedded in the browser per thread
- TERM-02: WebSocket connection auto-reconnects with exponential backoff and state recovery
- TERM-03: Terminal dimensions stay in sync across browser, WebSocket, and tmux/PTY
- TERM-04: User can disconnect and reconnect to find their session exactly where they left off

**Success Criteria:**

1. User sees an interactive terminal in the browser, types commands, and sees output in real time
2. User closes the browser tab, reopens it, and the terminal shows previous session state (scrollback intact)
3. User resizes the browser window and the terminal content reflows correctly (no garbled output in vim/OpenCode)
4. User's WiFi drops for 30 seconds, reconnects, and the terminal continues from where it left off without data loss
5. User runs a long-running agent (OpenCode), walks away, comes back hours later, and can resume interaction

**Key Work:**

- xterm.js v6 component with fit addon + WebGL renderer
- Wire up Paseo's binary mux terminal streams end-to-end
- tmux session integration (daemon spawns/attaches to tmux sessions per terminal)
- `reconnecting-websocket` with exponential backoff on client
- Offset-based replay on reconnect with `tmux capture-pane` fallback
- Resize propagation: xterm.js → WebSocket → tmux (debounced 200ms, ResizeObserver)
- Server-side ping/pong heartbeat (30s intervals)

**Research Flags:** Light research recommended — xterm.js + tmux attachment specifics, reconnection flow details.

---

### Phase 3: Project & Thread Management

**Goal:** Users can manage multiple projects and threads, each with isolated worktrees and terminal sessions.

**Dependencies:** Phase 2 (working terminal sessions)

**Plans:** 5 plans

- [x] 03-01-PLAN.md — Canonical project registry, thread persistence foundation, and contract migration
- [x] 03-02-PLAN.md — Server thread lifecycle orchestration (create/switch/delete + cleanup)
- [x] 03-03-PLAN.md — Shadcn sidebar, thread dialogs, and external thread store switching UX
- [x] 03-04-PLAN.md — Session reaper and end-to-end regression coverage for thread management
- [x] 03-05-PLAN.md — Gap closure: wire create-thread base branch + command override end-to-end

**Requirements:**

- PROJ-01: User can see all projects in a sidebar pulled from configured git repos
- PROJ-02: User can create multiple threads per project, each with its own git worktree
- PROJ-03: User can create and delete threads (worktree + tmux session lifecycle)
- PROJ-04: User can switch between active threads with a click
- PROJ-05: User can select which CLI agent to run per thread (OpenCode, Claude Code, etc.)

**Success Criteria:**

1. User sees a sidebar listing all configured projects, with threads nested under each project
2. User clicks "New Thread" on a project, picks an agent, and within seconds has a terminal running that agent in a fresh git worktree
3. User clicks a different thread and the terminal panel switches to that thread's live session (previous thread keeps running)
4. User deletes a thread and the worktree, tmux session, and agent process are all cleaned up (no orphans)
5. User can choose between OpenCode, Claude Code, or other CLI agents when creating a thread, and the selected agent starts in the terminal

**Key Work:**

- Reuse/adapt Paseo's `worktree.ts` (987 lines) for worktree CRUD
- Thread lifecycle: create worktree → create tmux session → start agent → attach PTY
- Multi-project sidebar component (list projects from config, expand/collapse threads)
- Thread switching (detach from current tmux session, attach to selected one, swap xterm.js)
- Agent selector (configurable list of CLI commands: `opencode`, `claude`, etc.)
- Session reaper: every 5 minutes, kill orphaned tmux sessions not tracked by daemon
- Deterministic tmux session naming: `oisin-{project}-{thread}`

**Research Flags:** None — Paseo's worktree code covers the hard parts, thread lifecycle is architectural.

---

### Phase 4: Code Diffs

**Goal:** Users can review uncommitted code changes per thread without leaving the browser.

**Dependencies:** Phase 3 (threads with git worktrees)

**Plans:** 6 plans

- [x] 04-01-PLAN.md — Server diff contracts and git-order alignment
- [x] 04-02-PLAN.md — Thread-scoped diff external store and subscription lifecycle
- [x] 04-03-PLAN.md — Desktop/mobile diff panel shells with persisted resize behavior
- [x] 04-04-PLAN.md — diff2html rendering, refresh flow, and browser regressions
- [x] 04-05-PLAN.md — Gap closure: preserve git-order diff payloads and regression coverage
- [x] 04-06-PLAN.md — Gap closure: rename metadata and syntax-highlight fidelity

**Requirements:**

- DIFF-01: User can view uncommitted code changes per thread with syntax highlighting

**Success Criteria:**

1. User clicks a thread and sees a diff panel showing all uncommitted changes in that thread's worktree with syntax-highlighted code
2. User makes changes via the agent in the terminal, and the diff panel updates to reflect new changes (manual refresh or auto-poll)

**Key Work:**

- diff2html integration for rendering `git diff` output per worktree
- Diff panel component (collapsible, alongside terminal)
- Periodic or on-demand diff refresh (poll `git diff` in worktree directory)
- Syntax-highlighted, dark-themed diff rendering
- File change list showing which files changed

**Research Flags:** Light research recommended — diff2html integration patterns, layout approach for diff panel alongside terminal.

---

## Progress

| Phase                           | Status                | Requirements                                | Completion |
| ------------------------------- | --------------------- | ------------------------------------------- | ---------- |
| 1 - Foundation & Docker         | Complete (2026-02-21) | DOCK-01                                     | 10100%     |
| 2 - Terminal I/O                | Complete (2026-02-23) | TERM-01, TERM-02, TERM-03, TERM-04          | 100%       |
| 3 - Project & Thread Management | Complete (2026-02-23) | PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05 | 100%       |
| 4 - Code Diffs                  | Complete (2026-02-23) | DIFF-01                                     | 100%       |

**Overall:** 11/11 requirements complete (100%)

## Coverage Map

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| DOCK-01     | Phase 1 | Complete |
| TERM-01     | Phase 2 | Complete |
| TERM-02     | Phase 2 | Complete |
| TERM-03     | Phase 2 | Complete |
| TERM-04     | Phase 2 | Complete |
| PROJ-01     | Phase 3 | Complete |
| PROJ-02     | Phase 3 | Complete |
| PROJ-03     | Phase 3 | Complete |
| PROJ-04     | Phase 3 | Complete |
| PROJ-05     | Phase 3 | Complete |
| DIFF-01     | Phase 4 | Complete |

**Mapped:** 11/11 ✓
**Orphaned:** 0

---

_Roadmap created: 2026-02-21_
_Last updated: 2026-02-23_
