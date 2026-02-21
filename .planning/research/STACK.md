# Stack Research

**Domain:** AI Coding Agent Web UI (self-hosted, terminal-based)
**Researched:** 2026-02-21
**Confidence:** HIGH (core libraries verified via GitHub releases/READMEs)

## Context: What Paseo Already Provides

Paseo (v0.1.15) is a TypeScript monorepo with:
- **`packages/server`** — Node.js daemon (agent orchestration, WebSocket API, MCP server)
- **`packages/app`** — Expo client (iOS, Android, web) using React Native / Expo Router
- **`packages/cli`** — CLI for daemon and agent workflows
- **`packages/relay`** — Relay for remote connectivity (previously Cloudflare, custom node relay in old fork)

The existing stack includes TypeScript, Expo (React Native Web), and a WebSocket-based daemon. We are NOT replacing the core — we're adding/improving specific capabilities on top.

---

## Recommended Stack Additions

### Terminal Emulation (CLIENT-SIDE)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **@xterm/xterm** | 6.0.0 | Web terminal emulator | The industry standard. Used by VS Code, Hyper, Theia, and 20k+ GitHub stars. v6 released Dec 2025 with ESM support, WebGL improvements, and ligatures. No real competitor exists at this quality level. Explicitly supports tmux/curses apps. | HIGH |
| **@xterm/addon-fit** | 0.10.0+ | Auto-resize terminal to container | Essential for responsive layout. Must resize terminal when panels resize. | HIGH |
| **@xterm/addon-webgl** | 0.18.0+ | GPU-accelerated rendering | Critical for performance with fast agent output. The DOM renderer is fine for light use, but WebGL handles high-throughput terminal output (AI agent streams) much better. Fall back to DOM if WebGL unavailable. | HIGH |
| **@xterm/addon-web-links** | 0.11.0+ | Clickable URLs in terminal | Quality-of-life. Agents output URLs constantly (file paths, docs links). | HIGH |
| **@xterm/addon-search** | 0.15.0+ | Search within terminal buffer | Useful for finding specific agent output in long sessions. | MEDIUM |
| **@xterm/addon-unicode-graphemes** | 0.3.0+ | Unicode/emoji support | Agents output emoji, Unicode chars. Without this, rendering breaks. | MEDIUM |

**Key note on xterm.js v6:** The package migrated to the `@xterm` npm scope in v5.4.0. The old `xterm` package is deprecated. v6.0.0 is the latest stable (Dec 22, 2025). Breaking changes include: canvas renderer removed (use DOM or WebGL), `windowsMode` removed, viewport scrollbar reworked.

### Terminal Backend (SERVER-SIDE)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **node-pty** | 1.1.0 | Fork pseudoterminals in Node.js | Microsoft-maintained, used by VS Code. Powers the PTY side of xterm.js connections. 1.8k stars, 29.9k dependents. Latest v1.1.0 released Dec 2025. Required for spawning terminal processes that xterm.js connects to. | HIGH |
| **tmux** (system dep) | 3.4+ | Terminal multiplexer | Already part of Paseo's architecture. Each thread gets a tmux session. tmux provides session persistence, detach/reattach, and window management — all critical for agent sessions that outlive browser connections. | HIGH |

**Architecture decision — node-pty vs tmux `capture-pane`:**
- **Use node-pty** for spawning the initial tmux sessions and piping I/O to xterm.js via WebSocket
- **Use tmux commands** (`capture-pane`, `send-keys`) for session management, reconnection, and state recovery
- **Do NOT use node-pty alone** without tmux — you lose session persistence when the browser disconnects
- Paseo already uses this hybrid approach; keep it

### Diff Viewing

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **diff2html** | 3.4.55 | Git diff to pretty HTML | **Recommended over react-diff-viewer.** 3.3k stars, actively maintained (latest release Jan 2026). Parses unified/git diff output directly — perfect since we're running `git diff` in worktrees anyway. Supports side-by-side, line-by-line, syntax highlighting via highlight.js, GitHub-like styling, dark/light mode, synchronized scroll. Framework-agnostic (works with React via `dangerouslySetInnerHTML` or a thin wrapper). | HIGH |

**Why diff2html over react-diff-viewer:**
- `react-diff-viewer` (original) — last release May 2020, 1.6k stars, unmaintained for 5+ years. Uses Emotion for styling, class components, React 16 era. 60 open issues.
- `react-diff-viewer-continued` — community fork, but fragmented (multiple forks, unclear which is canonical)
- `diff2html` — actively maintained through 2026, handles raw git diff output natively (no need to split old/new values), has built-in syntax highlighting, and supports dark mode via CSS variables. More stars, more downloads, more reliable.

**Integration pattern:**
```typescript
// Server: run git diff in worktree
const diff = execSync('git diff', { cwd: worktreePath }).toString();

// Client: render with diff2html
import { html as diff2html } from 'diff2html';
const diffHtml = diff2html(diffString, {
  outputFormat: 'side-by-side',
  matching: 'lines',
  highlight: true,
  colorScheme: 'dark',
});
```

### WebSocket Communication

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **ws** (server) | 8.19.0 | WebSocket server for Node.js | Already likely used by Paseo. 22.7k stars, 26.2M dependents. The standard. Latest v8.19.0 (Jan 2026). Zero dependencies, blazing fast, battle-tested. Has built-in ping/pong heartbeat support — critical for detecting broken connections. | HIGH |
| **reconnecting-websocket** (client) | 4.4.0 | Auto-reconnecting WebSocket client | Solves Paseo's #1 reliability problem (dropped connections). Drop-in WebSocket API replacement with automatic reconnection, exponential backoff, message buffering during disconnects, configurable timeouts. 1.3k stars, works in browser and React Native. | HIGH |

**Why reconnecting-websocket is critical:**
Paseo's WebSocket drops are the #1 user pain point. Rather than building custom reconnection logic, `reconnecting-websocket` provides:
- Configurable reconnection delay with exponential backoff
- Message buffering during disconnects (queued sends)
- Connection timeout handling
- Same API as native WebSocket (drop-in replacement)
- URL can be a function or async function (useful for token refresh)

**Recommended configuration:**
```typescript
import ReconnectingWebSocket from 'reconnecting-websocket';

const ws = new ReconnectingWebSocket(wsUrl, [], {
  connectionTimeout: 4000,
  maxRetries: Infinity,        // never stop trying
  maxReconnectionDelay: 10000, // max 10s between retries
  minReconnectionDelay: 1000,  // start at 1s
  reconnectionDelayGrowFactor: 1.3,
  maxEnqueuedMessages: Infinity, // buffer everything
});
```

**Server-side heartbeat pattern (ws library):**
```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
```

### Git Operations

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **simple-git** | 3.x | Git operations from Node.js | Mature wrapper around git CLI. Needed for: listing projects, creating/listing worktrees, running `git diff` for the diff panel, checking uncommitted changes. Better than shelling out with `child_process` — handles errors, promises, streaming. | MEDIUM |

**Alternative considered:** `isomorphic-git` — pure JS git implementation, but doesn't support worktrees and is slower for our use case (we have git available in Docker). Stick with `simple-git` which wraps the real git CLI.

### Docker

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **Node.js base image** | 22-slim | Docker base | Node 22 LTS (active LTS through Oct 2027). Use `-slim` variant to keep image small. | HIGH |
| **tmux** (apt) | 3.4+ | Terminal multiplexer in container | Install via apt in Dockerfile. Essential system dependency. | HIGH |
| **git** (apt) | 2.x | Git operations in container | Install via apt. Required for worktree management, diff generation. | HIGH |

**Dockerfile strategy:**
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y \
    tmux \
    git \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*
# build-essential + python3 needed for node-pty native compilation
```

### UI Components (Within Expo Web)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **Existing Expo/RN Web** | (from Paseo) | Base UI framework | Keep Paseo's Expo setup. Works for web. Don't fight it. | HIGH |
| **CSS custom properties** | — | Theming (dark mode) | For consistent dark theme across xterm.js, diff2html, and app UI. Avoid adding a separate theme library. | HIGH |

**Note on Expo + xterm.js:**
xterm.js is a DOM-based library. In Expo web (React Native Web), you'll need to render it inside a web-only component. Use `Platform.OS === 'web'` guards and render xterm.js in a `<div>` via a ref. This is a solved pattern — Paseo likely already does something similar for their terminal view.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **highlight.js** | 11.x | Syntax highlighting in diffs | Used by diff2html for code syntax coloring. Include slim build with common languages only. | 
| **diff** (jsdiff) | 7.x | Text diffing algorithm | Only if you need to diff arbitrary text (not git output). diff2html handles git diffs natively. |
| **zustand** or **jotai** | latest | Lightweight state management | If Expo's built-in state (Context/useState) becomes unwieldy for managing threads/projects state. Prefer zustand for simplicity. Don't add Redux. |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **TypeScript** | Type safety | Already in Paseo. Keep strict mode. |
| **ESLint + Prettier** | Code quality | Already in Paseo (`.prettierrc` exists). |
| **npm workspaces** | Monorepo management | Paseo uses npm workspaces. Keep it. |

---

## Installation

```bash
# Terminal emulation (client-side, add to packages/app)
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links @xterm/addon-search @xterm/addon-unicode-graphemes

# Terminal backend (server-side, add to packages/server)
npm install node-pty

# Diff viewing (can be client-side or server-rendered)
npm install diff2html

# WebSocket reliability (client-side)
npm install reconnecting-websocket

# Git operations (server-side)
npm install simple-git

# ws is likely already a dependency via Paseo — verify before adding
npm install ws

# Dev dependencies for xterm.js CSS (may need depending on bundler)
# xterm.css must be imported: import '@xterm/xterm/css/xterm.css'
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not the Alternative |
|----------|-------------|-------------|------------------------|
| Terminal | @xterm/xterm 6.0 | `terminal.js`, `hterm` | No competitors at xterm.js quality level. terminal.js is dead. hterm (Chrome OS) is not designed for embedding. |
| Terminal backend | node-pty + tmux | node-pty alone | Lose session persistence. Agent sessions must survive browser disconnects. tmux provides this. |
| Terminal backend | node-pty | `@homebridge/node-pty-prebuilt-multiarch` | Prebuilt binaries are convenient but we're building in Docker anyway where native compilation works fine. Stick with official. |
| Diff viewer | diff2html | react-diff-viewer | Unmaintained (last release 2020), doesn't parse git diff natively, React-only. diff2html is actively maintained, framework-agnostic, handles raw git output. |
| Diff viewer | diff2html | Monaco Editor diff | Overkill. Monaco is 5MB+ bundled. We don't need a full editor, just diff display. Save Monaco for if we ever need inline editing. |
| WebSocket client | reconnecting-websocket | Custom reconnection | Why reinvent the wheel? This is a solved problem. The library is small (4KB), well-tested, and API-compatible. |
| WebSocket client | reconnecting-websocket | socket.io | Socket.io adds unnecessary abstraction, fallback transports we don't need (we know we have WebSocket support), and a larger bundle. For a controlled self-hosted environment, raw WebSocket with reconnection is simpler and faster. |
| WebSocket server | ws | socket.io server | Same reasoning. ws is lighter, faster, and we don't need socket.io's room/namespace features for a single-user app. |
| Git | simple-git | isomorphic-git | isomorphic-git doesn't support worktrees (critical feature). We have real git in the Docker container. |
| State management | Context/zustand | Redux, MobX | Over-engineered for a single-user app. Start with React Context, add zustand only if needed. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **socket.io** | Unnecessary abstraction layer, larger bundle, fallback transports unneeded in self-hosted Docker environment | `ws` (server) + `reconnecting-websocket` (client) |
| **Monaco Editor** (for diffs) | 5MB+ bundle for a feature we only need in read-only diff mode | `diff2html` (100KB, does exactly what we need) |
| **Old `xterm` npm package** | Deprecated since v5.4.0 (2024). Security risk, no updates. | `@xterm/xterm` (new scoped package) |
| **react-diff-viewer** | Unmaintained since 2020, 60 open issues, class components, emotion dependency | `diff2html` |
| **Electron/Tauri** (for desktop) | Adds deployment complexity. Web-first approach works from any device including phones. | Expo Web served via Docker |
| **ACP protocol** | Reliability concerns, limited agent support. Terminal-based approach is universal. | tmux sessions with node-pty |
| **isomorphic-git** | No worktree support, slower than native git, unnecessary pure-JS overhead | `simple-git` (wraps native git CLI) |
| **Redux / MobX** | Over-engineered state management for single-user app | React Context, zustand if needed |
| **SSH/mosh** for terminal transport | Unnecessary layer of complexity when we control both server and client in Docker | Direct WebSocket + node-pty pipe |

---

## Version Verification Summary

| Library | Latest Verified | Source | Date Checked |
|---------|----------------|--------|--------------|
| @xterm/xterm | 6.0.0 | GitHub releases page | 2026-02-21 |
| node-pty | 1.1.0 | GitHub releases page | 2026-02-21 |
| ws | 8.19.0 | GitHub releases page | 2026-02-21 |
| diff2html | 3.4.55 | GitHub releases page | 2026-02-21 |
| reconnecting-websocket | 4.4.0 | GitHub releases page | 2026-02-21 |
| Paseo | 0.1.15 | GitHub releases page | 2026-02-21 |

---

## Sources

- **@xterm/xterm 6.0.0**: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0 (Dec 22, 2025) — HIGH confidence
- **@xterm/xterm README**: https://github.com/xtermjs/xterm.js — HIGH confidence  
- **node-pty 1.1.0**: https://github.com/microsoft/node-pty/releases/tag/v1.1.0 (Dec 22, 2025) — HIGH confidence
- **ws 8.19.0**: https://github.com/websockets/ws/releases/tag/8.19.0 (Jan 5, 2026) — HIGH confidence
- **diff2html 3.4.55**: https://github.com/rtfpessoa/diff2html/releases (Jan 1, 2026) — HIGH confidence
- **react-diff-viewer**: https://github.com/praneshr/react-diff-viewer — last release v3.1.0 May 2020, confirmed unmaintained
- **reconnecting-websocket 4.4.0**: https://github.com/pladaria/reconnecting-websocket/releases/tag/v4.4.0 (Feb 2020) — MEDIUM confidence (stable but not recently updated; however, WebSocket API hasn't changed so this is fine)
- **Paseo**: https://github.com/getpaseo/paseo — v0.1.15, Feb 19, 2026 — HIGH confidence
