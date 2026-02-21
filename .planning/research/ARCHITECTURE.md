# Architecture Research

**Domain:** AI Coding Agent Web UI (self-hosted, terminal-based)
**Researched:** 2026-02-21
**Confidence:** HIGH (based on detailed analysis of existing Paseo codebase + ecosystem patterns)

## Executive Summary

The architecture of a self-hosted AI coding agent UI follows a well-established pattern: a **long-running daemon** on the host machine manages terminal processes, git worktrees, and agent sessions, while a **web client** communicates over WebSocket for real-time terminal I/O and structured JSON messages for commands/state.

Paseo's existing architecture is fundamentally sound and well-engineered. The daemon (Express + ws), terminal management (node-pty + @xterm/headless), worktree orchestration (git CLI), and client communication (WebSocket with binary mux) are the right technology choices. The changes needed are about **simplification** (dropping Expo/mobile, voice, Tauri), **reliability** (fixing WebSocket reconnection), and **UI reshaping** (Codex-inspired layout instead of Paseo's mobile-first layout).

## Standard Architecture

### System Overview

```
┌─────────────────────── Docker Container ───────────────────────┐
│                                                                 │
│  ┌────────────────── Daemon (packages/server) ──────────────┐  │
│  │                                                           │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐    │  │
│  │  │ Express  │  │ WebSocket    │  │ Agent Manager   │    │  │
│  │  │ HTTP     │  │ Server (ws)  │  │                 │    │  │
│  │  │          │  │              │  │ ┌─────────────┐ │    │  │
│  │  │ /api/*   │  │ JSON msgs   │  │ │ Agent Store │ │    │  │
│  │  │ /public  │  │ Binary mux  │  │ │ (persisted) │ │    │  │
│  │  │ /mcp/*   │  │ (terminal)  │  │ └─────────────┘ │    │  │
│  │  └──────────┘  └──────┬───────┘  └────────┬────────┘    │  │
│  │                       │                    │              │  │
│  │  ┌────────────────────┴────────────────────┴──────────┐  │  │
│  │  │              Terminal Manager                       │  │  │
│  │  │                                                     │  │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │  │  │
│  │  │  │ PTY +   │  │ PTY +   │  │ PTY +   │  ...       │  │  │
│  │  │  │ xterm   │  │ xterm   │  │ xterm   │            │  │  │
│  │  │  │ headless│  │ headless│  │ headless│            │  │  │
│  │  │  └────┬────┘  └────┬────┘  └────┬────┘            │  │  │
│  │  └───────┼────────────┼────────────┼──────────────────┘  │  │
│  │          │            │            │                      │  │
│  │  ┌───────┴────────────┴────────────┴──────────────────┐  │  │
│  │  │              tmux sessions (per worktree)           │  │  │
│  │  │                                                     │  │  │
│  │  │  [project-a/feat-1]  [project-a/feat-2]  [proj-b]  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Git Worktree Manager                    │  │  │
│  │  │                                                     │  │  │
│  │  │  ~/.oisin/worktrees/{hash}/{slug}/                  │  │  │
│  │  │  Each worktree = branch + isolated directory        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──── Relay (packages/relay) ────┐                            │
│  │  Node WS relay for remote      │                            │
│  │  access (optional, same        │                            │
│  │  container or separate)        │                            │
│  └────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
         │
         │ WebSocket (ws:// or wss:// via relay)
         │
┌────────┴──────────── Web Client ────────────────────────────────┐
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ Sidebar  │  │ Center Panel │  │ Right Panel             │   │
│  │          │  │              │  │                         │   │
│  │ Projects │  │ Terminal     │  │ Code Diff View          │   │
│  │ Threads  │  │ (xterm.js)  │  │ (file changes per       │   │
│  │          │  │              │  │  worktree)              │   │
│  │ Status   │  │ Chat/Agent   │  │                         │   │
│  │ indicators│ │ Output       │  │ File Explorer           │   │
│  └──────────┘  └──────────────┘  └─────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Daemon Client (from @getpaseo/server client/)            │  │
│  │  - WebSocket transport (JSON messages + binary mux)       │  │
│  │  - Terminal stream manager (offset-based replay)          │  │
│  │  - Reconnection logic                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Daemon (server)** | Lifecycle orchestrator. Manages agent sessions, terminals, worktrees, file operations. Single long-running Node.js process. | Web Client (WebSocket), tmux/PTY (child processes), git (CLI), relay (WebSocket) |
| **Terminal Manager** | Creates/destroys PTY sessions via `node-pty`, wraps each in `@xterm/headless` for server-side terminal emulation. Manages raw output buffering with offset-based replay. | Daemon (direct API), PTY processes |
| **Agent Manager** | Tracks agent lifecycle (creating, running, stopped, archived). Persists agent metadata to disk. Manages agent process spawning. | Terminal Manager (creates terminal per agent), Agent Storage (persistence) |
| **Worktree Manager** | Creates/lists/deletes git worktrees under `~/.oisin/worktrees/{project-hash}/{slug}/`. Runs setup/destroy commands from config. | git CLI, file system |
| **WebSocket Server** | Multiplexes JSON control messages and binary terminal data over single WebSocket connection. Handles client sessions, authentication. | Web Client, Terminal Manager, Agent Manager |
| **Binary Mux Protocol** | Efficient binary framing for terminal I/O. 24-byte header with channel, message type, stream ID, offset. Supports replay from offset. | WebSocket Server, Terminal Stream Manager (client) |
| **Web Client** | Renders UI, manages local state (Zustand), communicates with daemon via daemon-client library. | Daemon (WebSocket), xterm.js (rendering) |
| **Daemon Client** | Client-side SDK (~3000 lines). Handles WebSocket connection, message parsing, terminal stream management, reconnection. Shared between all client surfaces. | WebSocket transport, Terminal Stream Manager |
| **Relay** | WebSocket relay server for remote access. Pairs server↔client via `serverId` + `clientId`. Supports E2EE via encrypted channels. | Daemon (server-side WebSocket), Web Client (client-side WebSocket) |

## Recommended Project Structure

Based on Paseo's architecture, **simplified for web-only, Docker-first deployment**:

```
packages/
├── server/              # Node.js daemon [KEEP, MODIFY]
│   └── src/
│       ├── server/      # Bootstrap, Express, WebSocket server
│       │   ├── index.ts
│       │   ├── bootstrap.ts
│       │   ├── config.ts
│       │   ├── websocket-server.ts  # SIMPLIFY: remove voice
│       │   ├── agent/               # Agent lifecycle management
│       │   └── file-explorer/       # File browsing service
│       ├── terminal/    # node-pty + xterm headless [KEEP AS-IS]
│       │   ├── terminal.ts
│       │   └── terminal-manager.ts
│       ├── client/      # Daemon client SDK [KEEP, USED BY APP]
│       │   ├── daemon-client.ts
│       │   ├── daemon-client-transport.ts
│       │   └── daemon-client-terminal-stream-manager.ts
│       ├── shared/      # Protocol types, binary mux [KEEP AS-IS]
│       │   ├── messages.ts
│       │   ├── binary-mux.ts
│       │   └── daemon-endpoints.ts
│       └── utils/       # Worktree, git, path utilities [KEEP]
│           ├── worktree.ts
│           └── checkout-git.ts
│
├── app/                 # Web client [REPLACE EXPO → NEXT.JS or VITE REACT]
│   └── src/
│       ├── components/  # UI components
│       │   ├── layout/  # Sidebar, panels, header
│       │   ├── terminal/# xterm.js terminal component
│       │   ├── diff/    # Code diff viewer
│       │   └── common/  # Buttons, inputs, etc.
│       ├── stores/      # Zustand state management [KEEP PATTERN]
│       ├── hooks/       # React hooks [KEEP PATTERN]
│       ├── contexts/    # Session, daemon registry [KEEP PATTERN]
│       └── terminal/    # Terminal runtime [KEEP FROM PASEO]
│           ├── terminal-emulator-runtime.ts
│           ├── terminal-stream-controller.ts
│           └── terminal-output-pump.ts
│
├── relay/               # WebSocket relay [KEEP, node-adapter]
│   └── src/
│       ├── node-adapter.ts  # Self-hosted relay server
│       ├── encrypted-channel.ts
│       └── crypto.ts
│
└── cli/                 # CLI tools [KEEP FOR ADMIN, SIMPLIFY]
    └── src/
        └── commands/    # Agent, daemon management
```

### What to Keep vs Change from Paseo

| Component | Action | Rationale |
|-----------|--------|-----------|
| `server/terminal/` | **KEEP AS-IS** | node-pty + @xterm/headless is the correct approach. Robust raw output buffering with offset-based replay. |
| `server/client/` (daemon-client) | **KEEP AS-IS** | ~3000-line battle-tested client SDK with reconnection, binary mux, terminal stream management. Essential. |
| `shared/binary-mux.ts` | **KEEP AS-IS** | Efficient binary protocol for terminal I/O. 24-byte header, channel multiplexing. Don't reinvent. |
| `shared/messages.ts` | **KEEP, TRIM** | 2267-line Zod schema. Remove voice-related messages, keep agent/terminal/worktree/checkout messages. |
| `server/bootstrap.ts` | **KEEP, SIMPLIFY** | Remove voice MCP bridge, speech runtime. Keep Express + WS + AgentManager + TerminalManager core. |
| `utils/worktree.ts` | **KEEP AS-IS** | 987 lines of well-tested git worktree management. Handles creation, deletion, setup commands, runtime env. |
| `relay/node-adapter.ts` | **KEEP AS-IS** | Custom Node relay server. Already replaced Cloudflare dependency. Handles V1/V2 protocol, client pairing. |
| `app/` (Expo) | **REPLACE** | Expo is for mobile-first. Replace with Vite + React for web-only. Keep Zustand stores, hooks patterns. |
| `desktop/` (Tauri) | **DROP** | Not needed. Docker + web UI replaces desktop app. |
| `server/speech/` | **DROP** | Voice features not in scope for v1. |
| `server/voice-*` | **DROP** | All voice-related server code. |
| `website/` | **DROP** | Marketing site not needed for personal tool. |

## Architectural Patterns

### Pattern 1: Single WebSocket with Binary Multiplexing

**What:** All daemon↔client communication goes through one WebSocket connection. JSON text frames for structured messages (agent state, commands, responses). Binary frames for terminal I/O using the BinaryMux protocol.

**Why this is right:** A single connection simplifies reconnection, reduces overhead, and avoids the complexity of managing multiple connections per client. The binary mux adds < 24 bytes overhead per terminal chunk.

**How Paseo does it:**
```typescript
// Binary mux frame: 24-byte header
// [2b magic][1b version][1b channel][1b msgType][1b flags][2b reserved]
// [4b streamId][8b offset][4b payloadLen]
// [payload...]

// Channel 1 = Terminal, Channel 2 = FileTransfer
// Terminal message types: InputUtf8(1), OutputUtf8(2), Ack(3)

// JSON messages: { type: "...", ... } text frames
// Binary messages: BinaryMuxFrame binary frames
```

**Keep this pattern.** It's efficient and proven.

### Pattern 2: Offset-Based Terminal Replay

**What:** Each terminal session tracks a monotonically increasing byte offset. Raw PTY output is buffered (up to 8MB) with offset tracking. Clients can reconnect and replay from their last-seen offset.

**Why this is right:** Terminal output is a stream. Without offset tracking, reconnecting clients would either miss output or need a full terminal state re-render. The offset system allows efficient catch-up.

**How Paseo does it:**
```typescript
// Server-side: terminal.ts
subscribeRaw(listener, { fromOffset?: number }): {
  unsubscribe, replayedFrom, currentOffset, earliestAvailableOffset, reset
}

// Client-side: daemon-client-terminal-stream-manager.ts
class TerminalStreamManager {
  subscribe({ streamId, handler })
  receiveChunk({ chunk: { streamId, offset, endOffset, replay, data } })
  noteAck({ streamId, offset })
}
```

**Keep this pattern.** Essential for reliable terminal experience.

### Pattern 3: Server-Side Terminal Emulation with Client-Side Rendering

**What:** Daemon runs `@xterm/headless` (server-side xterm.js) to maintain canonical terminal state. Client runs `@xterm/xterm` (browser) for rendering. Raw PTY output is forwarded to both. The server provides full state snapshots on connect, then streams raw chunks.

**Why this is right:** The headless terminal on the server means the server always knows the "true" terminal state, enabling features like:
- Terminal state queries (what's on screen)
- Reconnection with full state
- Multiple clients viewing same terminal

**Alternative considered:** Stream raw PTY directly to client xterm.js only.
**Why rejected:** Client-only rendering means server can't introspect terminal state, and reconnection requires replaying entire raw history.

**Keep this pattern.** Paseo chose correctly.

### Pattern 4: tmux Sessions per Thread/Worktree

**What:** Each thread gets a tmux session that outlives individual terminal connections. The agent (OpenCode, Claude Code) runs inside tmux. The PTY connects to the tmux session.

**Why this is right for Oisin:**
- tmux sessions persist across client disconnects
- Multiple windows/panes per session
- Agent processes survive daemon restarts
- All CLI tools work naturally
- `tmux capture-pane` provides terminal state even without daemon

**Implementation approach:**
```bash
# Create tmux session for a thread
tmux new-session -d -s "oisin-{project}-{thread}" -c "{worktree_path}"

# Attach daemon's PTY to tmux session
tmux attach-session -t "oisin-{project}-{thread}"

# Or start agent in session
tmux send-keys -t "oisin-{project}-{thread}" "opencode" Enter
```

**Note:** Paseo doesn't currently use tmux — it spawns agents directly via node-pty. Adding tmux is a new layer that provides persistence and isolation benefits but adds complexity. The node-pty terminal manager can be adapted to connect to tmux sessions instead of raw shell processes.

### Pattern 5: Git Worktrees for Thread Isolation

**What:** Each coding thread gets its own git worktree — a separate working directory with its own branch, sharing the same git object store. Worktrees are stored under `~/.oisin/worktrees/{project-hash}/{slug}/`.

**Why this is right:**
- Zero-copy branch isolation (git worktrees share objects)
- Each thread can have uncommitted changes without conflicts
- Agent can work on files without affecting other threads
- Diff view per thread shows only that thread's changes

**How Paseo does it (keep this):**
```typescript
// Create: git worktree add "{path}" -b "{branch}" "{base}"
// List: git worktree list --porcelain (filtered by Paseo-owned paths)
// Delete: git worktree remove "{path}" --force
// Runtime env: PASEO_WORKTREE_PATH, PASEO_BRANCH_NAME, etc.
// Setup commands: from paseo.json (or oisin.json) worktree.setup[]
```

### Pattern 6: Zustand for Client State

**What:** Paseo uses Zustand (not Redux, not MobX) for client-side state management. Small, focused stores per concern (session, panel layout, checkout actions, sidebar state).

**Why this is right:**
- Minimal boilerplate
- Works with React 19
- Easy to persist/hydrate
- No provider nesting hell
- Can subscribe outside React components

**Keep this pattern.** Zustand stores from Paseo's app can be adapted.

## Data Flow

### Request Flow: Client → Daemon

```
1. User action (e.g., create new thread)
     ↓
2. React component calls store action
     ↓
3. Store calls daemon client method
     ↓
4. Daemon client serializes to JSON + sends via WebSocket
     ↓
5. WebSocket server receives, validates (Zod), routes
     ↓
6. Handler executes (e.g., createWorktree + createAgent + createTerminal)
     ↓
7. Response sent back via WebSocket JSON message
     ↓
8. Daemon client receives, calls registered handler
     ↓
9. Store updates state
     ↓
10. React re-renders
```

### Terminal Data Flow (Critical Path)

```
Agent (OpenCode) writes to stdout
     ↓
PTY process captures via node-pty.onData()
     ↓
Raw data appended to terminal's output buffer (offset tracked)
     ↓
@xterm/headless processes escape sequences (server state updated)
     ↓
Raw data subscribers notified (WebSocket server)
     ↓
Binary mux frame created:
  [channel=Terminal, msgType=OutputUtf8, streamId=terminalHash, 
   offset=byteOffset, payload=rawData]
     ↓
Sent as binary WebSocket frame to all connected clients
     ↓
Client receives binary frame → daemon-client decodes
     ↓
TerminalStreamManager dispatches to subscribed handlers
     ↓
Terminal component feeds data to @xterm/xterm (browser)
     ↓
xterm.js renders to canvas/DOM
```

### Terminal Input Flow (Reverse)

```
User types in xterm.js terminal
     ↓
xterm.js onData callback fires
     ↓
Client sends binary mux frame:
  [channel=Terminal, msgType=InputUtf8, streamId=terminalHash,
   offset=0, payload=keystrokes]
     ↓
WebSocket server receives → binary mux decode
     ↓
Terminal manager routes to correct PTY → ptyProcess.write(data)
     ↓
PTY delivers to shell/tmux → agent receives input
```

### Reconnection Flow (Critical for Reliability)

```
WebSocket disconnects (network issue, daemon restart)
     ↓
Daemon client detects close event
     ↓
Exponential backoff reconnection starts
     ↓
On reconnect:
  1. Send clientSessionKey for identity
  2. For each active terminal stream:
     - Send subscribe with lastSeenOffset
     - Server replays from that offset (or earliest available)
     - If offset expired: server sends reset=true, client does full refresh
  3. Request current agent states
  4. UI shows "reconnecting..." → "connected"
```

### State Management Architecture

```
┌─────────────────── Client State (Zustand) ─────────────────────┐
│                                                                  │
│  session-store       ← daemon connection state, server info      │
│  panel-store         ← panel visibility, sizes                   │
│  create-flow-store   ← new thread/project creation wizard        │
│  checkout-store      ← git status, diff data per worktree        │
│  draft-store         ← agent draft messages before sending       │
│  section-order-store ← sidebar section ordering                  │
│                                                                  │
│  All stores hydrated on connect from daemon state.               │
│  Terminal state is NOT in Zustand — lives in xterm.js instance.  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────── Server State (In-Memory) ────────────────────┐
│                                                                   │
│  AgentManager        ← agent lifecycle, running processes         │
│  AgentStorage        ← persisted agent records (JSON on disk)     │
│  TerminalManager     ← active PTY sessions + xterm headless      │
│  WorktreeManager     ← git worktree metadata                     │
│                                                                   │
│  Persisted to: ~/.oisin/ (agent records, server ID, key pair)    │
│  NOT persisted: terminal output (ephemeral, offset-buffered)     │
└───────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

#### 1. Creating a New Thread

```
Client: "Create thread for project X"
  → Daemon: createWorktree({ cwd: projectPath, branchName, baseBranch })
    → git worktree add ...
    → Run setup commands (from oisin.json)
    → Assign available port
    → Write worktree metadata
  ← Returns: { worktreePath, branchName }
  
  → Daemon: createAgent({ cwd: worktreePath, provider: "opencode" })
    → Start agent process in worktree directory
    → Create terminal (node-pty → tmux session → agent)
    → Register in AgentManager
  ← Returns: { agentId, terminalId }
  
  → Daemon: notify via WebSocket event (agent_created, terminal_created)
  ← Client: adds to sidebar, opens center panel
```

#### 2. Viewing Code Diffs

```
Client: selects thread in sidebar
  → Daemon: request checkout status for worktree
    → git status (staged/unstaged/untracked)
    → git diff (per-file diffs)
  ← Returns: { files: [...], diffs: {...} }
  
  Client: renders diff in right panel
  Daemon: polls or watches for changes, sends updates via WS
```

#### 3. Remote Access via Relay

```
Client (remote browser) → Relay Server (ws://relay:8080/ws)
  → Relay matches serverId + clientId
  → Relay creates data channel to Daemon
  → Daemon treats relay connection same as direct WS
  → Optional E2EE: client↔daemon encrypt over relay
  
Flow: Client ↔ Relay ↔ Daemon (transparent proxy)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Polling for Terminal State

**What:** Using HTTP polling or periodic WebSocket requests to fetch terminal state.
**Why bad:** Terminal output is high-frequency (agent thinking/coding generates lots of text). Polling adds latency and misses output between polls.
**Instead:** Use the existing streaming pattern — PTY data → WebSocket binary frames → client xterm.js. Real-time, zero-polling.

### Anti-Pattern 2: Separate WebSocket per Terminal

**What:** Opening a new WebSocket connection for each terminal session.
**Why bad:** Multiple connections multiply reconnection complexity, consume more resources, and make authentication harder.
**Instead:** Single WebSocket with binary mux (Paseo's existing approach). Stream ID identifies the terminal.

### Anti-Pattern 3: Storing Terminal History in Database

**What:** Persisting all terminal output to SQLite/Postgres for replay.
**Why bad:** Terminal output is high-volume (agent sessions can produce MBs), and most of it is only needed for live viewing. Database writes become a bottleneck.
**Instead:** In-memory ring buffer with offset tracking (Paseo's approach: 8MB max per terminal). For long-term history, tmux's capture-pane or scrollback files are sufficient.

### Anti-Pattern 4: Building Custom Agent Protocol

**What:** Creating a structured API to communicate with OpenCode/Claude Code/etc.
**Why bad:** Every agent has a different protocol. ACP is unstable. Building adapters for each agent is a maintenance nightmare.
**Instead:** Terminal-first approach. All agents work in a terminal. Wrap them in tmux sessions, pipe I/O through PTY. Universal compatibility.

### Anti-Pattern 5: Client-Side Terminal State as Source of Truth

**What:** Treating the browser's xterm.js as the authoritative terminal state.
**Why bad:** If the browser tab closes, state is lost. Multiple clients see inconsistent state. Server can't introspect the terminal.
**Instead:** Server-side @xterm/headless is source of truth. Client xterm.js is a renderer. This is what Paseo does correctly.

### Anti-Pattern 6: Hot-Reloading the Daemon

**What:** Using nodemon/tsx watch for daemon development.
**Why bad:** Daemon manages long-running processes (agents, terminals). Restarting kills all sessions. 
**Instead:** Paseo uses a supervisor script that gracefully handles restarts. For development, the daemon should handle SIGHUP for config reload without killing sessions. tmux sessions survive daemon restarts by design.

## Integration Points

### Daemon → Web Client (via WebSocket)

**Protocol:** Single WebSocket at `/ws`
**Authentication:** `clientSessionKey` query parameter
**Message types:**
- **Text frames:** JSON messages conforming to `SessionInboundMessage` / `SessionOutboundMessage` Zod schemas
- **Binary frames:** BinaryMux frames (terminal I/O, file transfers)

**Key message categories (from messages.ts):**
- Agent lifecycle: create, stop, archive, update, permission requests
- Terminal: list, create, subscribe, kill, input/output
- Git/Checkout: status, diff, commit, push, PR create/status
- Worktree: list, create, delete
- File explorer: browse, download tokens
- Provider/model: list providers, list models

### Daemon → Terminal Processes (via node-pty)

**Protocol:** node-pty spawns shell processes
**Current:** Direct PTY → shell
**Proposed:** PTY → tmux session → agent (OpenCode, etc.)

### Daemon → Git (via CLI)

**Protocol:** `child_process.exec` / `spawn` with git commands
**Key operations:** worktree add/remove/list, status, diff, commit, push
**Environment:** `GIT_OPTIONAL_LOCKS=0` for read-only operations

### Web Client → Terminal Display (via xterm.js)

**Protocol:** xterm.js Terminal API
**Addons needed:**
- `@xterm/addon-fit` — auto-resize to container
- `@xterm/addon-webgl` — GPU-accelerated rendering (optional, performance)
- `@xterm/addon-web-links` — clickable URLs

### Daemon → Relay (via WebSocket)

**Protocol:** V2 relay protocol. Server registers with `serverId`. Creates control channel + per-client data channels. Relay is a transparent frame forwarder.
**E2EE:** Optional, via `encrypted-channel.ts` using ECDH key exchange.

## Docker Architecture

```dockerfile
# Single container: daemon + relay + static web app
FROM node:22-slim

# Install: git, tmux, opencode (or agent binaries)
RUN apt-get update && apt-get install -y git tmux

# Copy built packages
COPY packages/server/dist/ /app/server/
COPY packages/app/dist/ /app/static/
COPY packages/relay/dist/ /app/relay/

# Daemon serves static web app from /public
# Relay runs alongside daemon in same container (or separate process)

EXPOSE 6767  # Daemon
EXPOSE 8080  # Relay (optional, can be same port)

# Entrypoint: start daemon (which serves web UI and terminal sessions)
CMD ["node", "/app/server/server/index.js"]
```

**Volume mounts:**
- `~/.oisin/` → `/root/.oisin/` (agent persistence, server ID, worktree metadata)
- Project directories → `/projects/` (git repos to work on)

## Build Order Implications

Based on component dependencies, the build order should be:

### Phase 1: Foundation (daemon core + basic web shell)
**Dependencies:** None
**Build:**
1. Fork Paseo, strip voice/speech/Tauri/Expo-mobile
2. Simplify bootstrap.ts (remove voice, keep Express + WS + Agent + Terminal)
3. Replace Expo web build with Vite + React
4. Basic web shell: connect to daemon, show connection status
5. Docker container with daemon + static web app

**Rationale:** Everything else depends on the daemon running and the web client connecting.

### Phase 2: Terminal I/O (the critical path)
**Dependencies:** Phase 1 (daemon running, web client connected)
**Build:**
1. Terminal component with xterm.js (reuse Paseo's terminal runtime)
2. Wire up binary mux terminal streams
3. Terminal input/output working end-to-end
4. tmux session integration (daemon spawns/attaches to tmux sessions)
5. Reconnection with offset-based replay

**Rationale:** Terminal is the core interaction. Everything else is secondary until typing in a terminal and seeing agent output works reliably.

### Phase 3: Thread/Worktree Management
**Dependencies:** Phase 2 (terminals working)
**Build:**
1. Worktree creation/listing/deletion (reuse Paseo's worktree.ts)
2. Thread = worktree + tmux session + agent
3. Sidebar showing projects and threads
4. Thread switching (attaches terminal to different tmux session)

**Rationale:** Multi-thread is the core differentiator. Requires working terminals.

### Phase 4: UI Polish (Codex-inspired layout)
**Dependencies:** Phase 3 (threads working)
**Build:**
1. Three-panel layout (sidebar, center, right)
2. Code diff view per thread
3. File explorer
4. Model/agent selector
5. Status indicators, keyboard shortcuts

**Rationale:** Polish comes after functionality. Layout can iterate once core features work.

### Phase 5: Reliability + Remote Access
**Dependencies:** Phase 2-4 working locally
**Build:**
1. WebSocket reconnection hardening
2. Relay integration for remote access
3. Docker deployment optimization
4. E2EE for relay connections

**Rationale:** Remote access is important but not needed until local experience is solid.

## Technology Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Terminal server-side | node-pty + @xterm/headless | Paseo's proven approach. node-pty is the standard for PTY in Node.js. |
| Terminal client-side | @xterm/xterm 6.x | Industry standard web terminal. Used by VS Code, Gitpod, etc. |
| WebSocket | ws (server) + native WebSocket (client) | Paseo's existing choice. ws is the fastest Node.js WS implementation. |
| Binary protocol | Custom BinaryMux (Paseo's) | Lightweight, purpose-built for terminal muxing. Keep it. |
| Process isolation | tmux sessions | **NEW** — adds persistence, survives daemon restarts, natural CLI environment. |
| Web framework | Vite + React | **CHANGE from Expo** — lighter, faster, web-native. No mobile overhead. |
| State management | Zustand | Paseo's choice. Minimal, works with React 19. Keep it. |
| Git operations | CLI via child_process | Paseo's choice. More reliable than git libraries. Keep it. |
| Deployment | Docker single container | Specified in project requirements. |
| Relay | Node.js WebSocket relay | Paseo's custom relay (already replaced Cloudflare). Keep it. |

## Scalability Considerations

| Concern | At 1-5 threads | At 10-20 threads | At 50+ threads |
|---------|----------------|-------------------|-----------------|
| Memory | ~200MB (daemon + terminals) | ~500MB (each PTY + xterm headless costs ~20MB) | ~2GB, may need terminal hibernation |
| CPU | Negligible | Terminal emulation overhead starts to matter with many active agents | Consider process limits |
| Disk (worktrees) | ~100MB per worktree | 1-2GB | Need cleanup strategy, shallow clones |
| WebSocket bandwidth | <1MB/s terminal output | ~5MB/s peak | May need per-terminal backpressure |

**For a personal tool (1-5 active threads), scalability is not a concern.** The architecture handles 20+ threads comfortably.

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| Paseo source code (old-oisin-ui fork) | Direct code analysis | HIGH |
| Paseo GitHub (getpaseo/paseo) | Official repo, v0.1.15 | HIGH |
| Paseo server package.json | Dependency analysis | HIGH |
| Paseo app package.json | Dependency analysis | HIGH |
| OpenHands GitHub | Architecture comparison | MEDIUM |
| xterm.js documentation | Official docs | HIGH |
| node-pty | Standard library for PTY in Node.js | HIGH |
| @xterm/headless | Server-side terminal emulation | HIGH |
| ws library | Industry-standard WebSocket for Node.js | HIGH |
