# Project Research Summary

**Project:** Oisin UI
**Domain:** AI Coding Agent Web UI (self-hosted, terminal-based)
**Researched:** 2026-02-21
**Confidence:** HIGH

## Executive Summary

Oisin UI is a self-hosted web interface for managing AI coding agents (OpenCode, Claude Code, Aider, Codex CLI — any terminal-based agent) across multiple projects and threads. The research confirms this is a well-defined problem space with proven architectural patterns: a long-running Node.js daemon orchestrates tmux sessions and git worktrees, while a browser client renders terminals via xterm.js over a multiplexed WebSocket. Paseo (the upstream fork) already implements the hardest parts — binary-multiplexed terminal I/O, offset-based replay, headless terminal emulation, and worktree management. The core work is **simplification** (strip Expo/mobile/voice/Tauri), **reliability** (fix WebSocket reconnection, the #1 Paseo pain point), and **UI reshaping** (Codex-inspired 3-panel layout: sidebar + terminal + diffs).

The recommended approach is to preserve Paseo's daemon (`packages/server`) nearly wholesale — its terminal manager, binary mux protocol, daemon-client SDK, and worktree utilities are battle-tested and correct. Replace the Expo-based client with a Vite + React web app. Add tmux session management as a persistence layer (Paseo currently spawns agents directly via node-pty without tmux). The key technology additions are `@xterm/xterm` v6 for browser rendering, `reconnecting-websocket` for connection reliability, and `diff2html` for code review. The stack is mature, well-documented, and used by VS Code, Gitpod, and similar production systems.

The primary risks are WebSocket state recovery on reconnection (the existing Paseo failure mode), terminal dimension desynchronization between xterm.js and tmux, orphaned process/session cleanup in Docker, and Docker PID 1 signal propagation. All four are well-understood problems with documented solutions. The single biggest differentiator — agent-agnosticism via terminal-first architecture — is also the simplest to implement because it's a design decision, not a feature to build. No competitor (Codex, Cursor, Windsurf, Aider) offers this.

## Key Findings

### Recommended Stack

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **@xterm/xterm** | 6.0.0 | Browser terminal emulator | Industry standard. Used by VS Code. v6 has ESM, WebGL improvements. No viable alternative exists. |
| **@xterm/addon-fit** | 0.10.0+ | Auto-resize terminal | Required for responsive multi-panel layout. |
| **@xterm/addon-webgl** | 0.18.0+ | GPU-accelerated rendering | For high-throughput agent output. Fall back to DOM renderer. |
| **node-pty** | 1.1.0 | Server-side PTY spawning | Microsoft-maintained. Powers VS Code terminal. Required for tmux session attachment. |
| **tmux** | 3.4+ (system) | Session persistence | Agent sessions survive browser disconnects and daemon restarts. |
| **diff2html** | 3.4.55 | Git diff rendering | Actively maintained, parses raw git diff natively, supports dark mode. Beats dead react-diff-viewer. |
| **reconnecting-websocket** | 4.4.0 | Client WebSocket reliability | Drop-in WebSocket replacement with exponential backoff, message buffering. Solves Paseo's #1 problem. |
| **ws** | 8.19.0 | Server WebSocket | Already in Paseo. 22.7k stars. Built-in ping/pong heartbeat. |
| **simple-git** | 3.x | Git operations | Wraps real git CLI. Required for worktree management, diff generation. |
| **Vite + React** | Latest | Web client framework | **Replaces Expo.** Web-only, faster builds, no mobile overhead. Keep Zustand stores pattern. |
| **Node.js 22 slim** | LTS | Docker base image | Active LTS through Oct 2027. Slim variant for image size. |
| **tini** | Latest | Docker PID 1 init | Signal propagation to child processes. Non-negotiable for multi-process container. |

**Critical version note:** Use `@xterm/xterm` (scoped package), NOT the deprecated `xterm` package. v6.0.0 is current.

**What NOT to use:** socket.io (unnecessary abstraction), Monaco Editor for diffs (5MB overkill), Electron/Tauri (web-first), isomorphic-git (no worktree support), Redux (over-engineered for single-user).

### Expected Features

**Table Stakes (P0 — users expect these):**
- Multi-project sidebar with thread management
- Embedded interactive terminal per thread (xterm.js → tmux)
- Real-time agent output streaming
- Reliable WebSocket with automatic reconnection and state recovery
- Git worktree isolation per thread
- Dark theme, responsive layout

**Differentiators (what makes Oisin UI unique):**
- **Agent-agnostic:** Works with ANY terminal-based CLI agent — OpenCode, Claude Code, Aider, Codex CLI, custom scripts. No vendor lock-in. This is the #1 differentiator vs every competitor.
- **Self-hosted Docker deployment:** Work from anywhere on your own infrastructure. No SaaS dependency.
- **Direct terminal access:** Not just agent output — full interactive terminal. Run any command remotely.
- **Codex-inspired 3-panel layout:** Sidebar | Terminal | Diffs — proven UX pattern.

**Defer to v2+ (anti-features):**
- In-browser code editor (use terminal vim/nano instead)
- Built-in LLM API integration (let the CLI agent handle it)
- Custom agent protocol/ACP (terminal approach is universal)
- Multi-user authentication (single-user personal tool)
- Mobile native app (responsive web is sufficient)
- Codebase indexing/semantic search (agent handles this)
- File tree explorer (terminal `ls`/`tree` suffices)

### Architecture Approach

**Preserve from Paseo (don't reinvent):**
- `server/terminal/` — node-pty + @xterm/headless with offset-based replay (correct approach)
- `server/client/` — ~3000-line daemon-client SDK with reconnection, binary mux, stream management
- `shared/binary-mux.ts` — 24-byte header binary protocol for terminal I/O multiplexing
- `shared/messages.ts` — Zod-validated message schemas (trim voice messages, keep rest)
- `utils/worktree.ts` — 987 lines of tested git worktree management
- `relay/node-adapter.ts` — Custom Node relay server (already replaced Cloudflare)
- Zustand for client state management

**Change from Paseo:**
- **Replace Expo → Vite + React** (web-only, no mobile overhead)
- **Add tmux sessions** as persistence layer (Paseo spawns agents directly; tmux survives daemon restarts)
- **Drop:** Tauri desktop, voice/speech, website, mobile-specific code

**Key architectural patterns to follow:**
1. Single WebSocket with binary multiplexing (JSON for control, binary for terminal I/O)
2. Offset-based terminal replay (8MB buffer per terminal, reconnect from last-seen offset)
3. Server-side headless terminal as source of truth (client xterm.js is just a renderer)
4. tmux sessions per thread/worktree (persistence, isolation, crash recovery)
5. Git worktrees for thread isolation (branch-per-thread, shared object store)

**Data flow:** Agent writes stdout → node-pty captures → buffer with offset tracking → @xterm/headless updates server state → binary mux frame via WebSocket → client xterm.js renders

### Critical Pitfalls

**1. WebSocket Reconnection Without State Recovery (CRITICAL — Phase 1)**
The #1 Paseo pain point. Transport reconnection alone is worthless without terminal state recovery. Solution: offset-based replay from server buffer, fall back to `tmux capture-pane` for full state snapshot. Use `reconnecting-websocket` with exponential backoff. Server-side ping/pong heartbeat at 30s intervals.

**2. Terminal Dimension Desync (CRITICAL — Phase 1)**
xterm.js, the WebSocket relay, and tmux must all agree on cols/rows. Desync causes garbled TUI output (vim, OpenCode). Solution: debounce resize events (200ms), propagate via `tmux resize-window`, always send dimensions on reconnect handshake, use ResizeObserver (not window resize).

**3. Orphaned tmux Sessions / Process Leaks (CRITICAL — Phase 1-2)**
Over days, zombie sessions accumulate. Solution: deterministic session naming (`oisin-{project}-{thread}`), session reaper every 5 minutes, `tmux kill-session` on thread delete (not just detach), reconcile on daemon startup.

**4. Docker PID 1 Signal Propagation (CRITICAL — Phase 1)**
Multi-process container (Node.js + tmux + agents) doesn't propagate signals by default. Solution: Use `tini` as entrypoint (`ENTRYPOINT ["/tini", "--"]`), graceful shutdown handler in Node.js that kills tmux sessions on SIGTERM, Docker HEALTHCHECK for both daemon and tmux server.

**5. xterm.js addon-fit Requires Visible Container (Phase 1)**
`fit()` returns 0 cols/0 rows on hidden containers. Solution: Use ResizeObserver, guard against zero dimensions, call `fit()` only after tab transitions complete.

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Foundation (Daemon Core + Web Shell + Docker)**
- Fork Paseo, strip voice/speech/Tauri/Expo-mobile
- Simplify `bootstrap.ts` to Express + WS + AgentManager + TerminalManager
- Replace Expo web → Vite + React app scaffold
- Basic web shell: connect to daemon, show connection status
- Docker container with `tini`, `tmux`, `git`, proper signal handling
- Bind daemon to localhost only (security baseline)
- **Delivers:** Running daemon in Docker, web client connects, connection status visible
- **Features from FEATURES.md:** WebSocket reliability (P0), dark theme scaffold
- **Pitfalls to avoid:** Docker PID 1 (#4), protocol versioning (Debt 1), localhost binding (Security 1)
- **Rationale:** Everything depends on the daemon running and the web client connecting. Get Docker right from day one.

**Phase 2: Terminal I/O (The Critical Path)**
- Terminal component with xterm.js (reuse Paseo's terminal runtime)
- Wire up binary mux terminal streams end-to-end
- tmux session integration (daemon spawns/attaches to tmux sessions)
- Reconnection with offset-based replay + `tmux capture-pane` fallback
- Resize propagation (xterm.js → WebSocket → tmux)
- Copy/paste keyboard handling
- Scrollback limits (conservative defaults)
- **Delivers:** Type in browser terminal, see agent output, survive reconnection
- **Features from FEATURES.md:** Embedded terminal (P0), agent output streaming (P0), reliable WebSocket (P0)
- **Pitfalls to avoid:** WebSocket state recovery (#1), dimension desync (#2), fit addon visibility (Gotcha 1), scrollback limits (Trap 1), copy/paste UX (UX 2)
- **Rationale:** Terminal is the entire product. Nothing else matters until this works flawlessly.

**Phase 3: Thread & Worktree Management**
- Worktree creation/listing/deletion (reuse Paseo's `worktree.ts`)
- Thread = worktree + tmux session + agent process
- Multi-project sidebar
- Thread switching (destroy/recreate xterm.js, attach to different tmux session)
- Thread status indicators (running/idle/complete/error)
- Session reaper for orphaned tmux sessions
- Branch-per-thread enforcement
- **Delivers:** Create tasks, switch between them, see agent work in isolated worktrees
- **Features from FEATURES.md:** Multi-project sidebar (P0), thread management (P0), git worktree per thread (P0)
- **Pitfalls to avoid:** Orphaned sessions (#3), branch checkout restrictions (Gotcha 3), lazy terminal instances (Trap 3), thread switching UX (UX 3)
- **Rationale:** Multi-thread is the core differentiator after terminal works. Requires working terminals (Phase 2).

**Phase 4: Code Review & Diffs**
- Three-panel Codex layout (sidebar | terminal | diffs)
- diff2html integration for git diff rendering per worktree
- Stage/unstage hunks from UI
- Commit from UI (message field + button)
- File change list per thread
- **Delivers:** Full code review workflow without leaving the browser
- **Features from FEATURES.md:** Code diff panel (P1), git stage/commit UI (P1), 3-panel layout (P1)
- **Pitfalls to avoid:** Large diff handling (Trap 2), WebGL context loss (Gotcha 2), separate diff data channel (don't mix with terminal stream)
- **Rationale:** Diffs are table stakes but come after the core terminal + thread loop works.

**Phase 5: Remote Access & Hardening**
- Relay integration for remote access
- Authentication (API tokens, reverse proxy guidance)
- WSS/TLS for remote connections
- E2EE for relay connections
- Docker deployment optimization (multi-stage build, image size)
- Health checks and monitoring
- Worktree cleanup automation
- Session persistence across browser reload
- **Delivers:** Access your dev environment from anywhere, securely
- **Features from FEATURES.md:** Remote access, worktree sync (P2), notifications (P2), session persistence (P2)
- **Pitfalls to avoid:** Auth exposure (Security 1 full version), real network conditions testing
- **Rationale:** Remote access is the "from anywhere" promise but not needed until local experience is solid.

### Phase Ordering Rationale

The ordering is strictly dependency-driven:
1. **Foundation first** — everything depends on daemon + web client + Docker running correctly
2. **Terminal second** — the product IS a terminal UI; without it, there's nothing to show
3. **Threads third** — multi-thread requires working terminals; this is the differentiator
4. **Diffs fourth** — code review requires threads and worktrees to exist
5. **Remote fifth** — remote access amplifies a working local product

Each phase produces a usable increment. After Phase 2, you have a functional (if single-thread) terminal-in-a-browser. After Phase 3, you have the core multi-thread agent management workflow. After Phase 4, it's a complete local development tool. Phase 5 unlocks the "from anywhere" vision.

### Research Flags

| Phase | Needs `/gsd-research-phase`? | Rationale |
|-------|------------------------------|-----------|
| Phase 1: Foundation | **No** | Well-documented patterns. Paseo codebase is the reference. Docker + tini + Node.js is standard. |
| Phase 2: Terminal I/O | **Yes — light research** | xterm.js + tmux integration specifics. Paseo's terminal runtime is a starting point but tmux attachment is new. Research the reconnection flow details. |
| Phase 3: Threads | **No** | Paseo's `worktree.ts` (987 lines) covers the hard parts. Thread lifecycle is architectural, not novel. |
| Phase 4: Diffs | **Yes — light research** | diff2html integration patterns, hunk staging UX. How Codex implements stage/unstage per hunk. |
| Phase 5: Remote | **No** | Paseo's relay already works. Auth patterns are standard (token + reverse proxy). |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | All libraries verified via GitHub releases (2025-12 to 2026-02). xterm.js v6, node-pty 1.1.0, diff2html 3.4.55 are current stable. Only `reconnecting-websocket` (last release 2020) is old but stable/API-frozen. |
| **Features** | HIGH | Direct analysis of Codex App, Cursor, Windsurf, Aider, Continue.dev official docs. Feature landscape is clear and convergent. Anti-features list is well-reasoned. |
| **Architecture** | HIGH | Based on detailed analysis of Paseo source code (~3000-line daemon-client, 987-line worktree manager, binary mux protocol). Patterns validated against VS Code, Gitpod, ttyd architectures. |
| **Pitfalls** | HIGH (core) / MEDIUM (edge cases) | Critical pitfalls (WebSocket, dimensions, Docker PID 1) are well-documented with proven solutions. tmux control mode and worktree scaling edge cases are less certain. |

### Gaps to Address During Planning

1. **tmux session attachment specifics:** Paseo doesn't currently use tmux — it spawns agents directly via node-pty. The integration pattern (node-pty → tmux attach) needs validation during Phase 2 implementation. How exactly does the PTY connect to an existing tmux session vs creating a new one?

2. **Expo → Vite migration scope:** How much of Paseo's app code (Zustand stores, hooks, contexts) can be reused vs rewritten? The stores are framework-agnostic but component code is Expo-specific.

3. **Hunk staging UX:** diff2html renders diffs but doesn't provide stage/unstage per hunk. This requires custom UI work over `git add --patch` equivalent. Research needed in Phase 4.

4. **Relay authentication flow:** Paseo's relay uses serverId/clientId pairing but the auth story for internet-exposed deployments needs hardening beyond what exists.

5. **Agent process spawning:** How exactly does a "create thread" flow work? Create worktree → create tmux session → start agent in tmux → attach PTY? The orchestration sequence needs careful design.

## Sources

### Stack Sources
- @xterm/xterm 6.0.0: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0 (Dec 2025) — HIGH
- node-pty 1.1.0: https://github.com/microsoft/node-pty/releases/tag/v1.1.0 (Dec 2025) — HIGH
- ws 8.19.0: https://github.com/websockets/ws/releases/tag/8.19.0 (Jan 2026) — HIGH
- diff2html 3.4.55: https://github.com/rtfpessoa/diff2html/releases (Jan 2026) — HIGH
- reconnecting-websocket 4.4.0: https://github.com/pladaria/reconnecting-websocket (Feb 2020) — MEDIUM (stable, API frozen)
- Paseo v0.1.15: https://github.com/getpaseo/paseo (Feb 2026) — HIGH

### Feature Sources
- OpenAI Codex App: developers.openai.com/codex/app/features — HIGH
- Cursor: cursor.com/features — HIGH
- Windsurf: docs.windsurf.com — HIGH
- Aider: aider.chat/docs — HIGH
- Continue.dev: github.com/continuedev/continue — HIGH

### Architecture Sources
- Paseo source code (old-oisin-ui fork): direct code analysis — HIGH
- xterm.js documentation and API: official docs — HIGH
- ttyd project: github.com/tsl0922/ttyd — HIGH (reference implementation)

### Pitfall Sources
- xterm.js FAQ (dimension desync): xtermjs/xterm.js wiki — HIGH
- git-worktree docs (v2.53.0 BUGS section): git-scm.com — HIGH
- tmux man page (control mode, signals): man7.org — HIGH
- Docker PID 1 / tini patterns: well-documented community patterns — HIGH
