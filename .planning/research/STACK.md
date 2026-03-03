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

---

# Stack Research: v3 TABS COOLERS (Milestone Additions)

**Researched:** 2026-03-02
**Focus:** Stack additions for multi-tab terminals, AI chat overlay, voice input, git push
**Context:** Subsequent milestone building on existing validated capabilities

## Executive Summary

Minimal stack additions needed. Multi-tab management is pure frontend state orchestration over existing xterm.js + tmux infrastructure. AI chat overlay requires `ansi_up` for ANSI→HTML conversion and custom parsing for OpenCode output format. Voice input via containerized `whisper-asr-webservice` (already Dockerized). Git push uses existing `simple-git` recommendation.

---

## Feature 1: Multi-Tab Terminal Management

### Recommendation: No new libraries needed

**Rationale:**
- Already have `@xterm/xterm` v6.0.0 in packages/web
- Already have `@xterm/headless` v6.0.0 in packages/server
- Already have tmux session management on backend
- Tab state is frontend-only: array of `{ id, sessionId, title, xterm instance }`

**Pattern:**
```typescript
// Tab abstraction over existing xterm
interface TerminalTab {
  id: string;
  threadId: string;
  sessionId: string; // tmux session
  title: string;
  xterm: Terminal;
  isActive: boolean;
}
```

**Integration with existing stack:**
- Each tab = 1 xterm.js Terminal instance
- Each tab maps to 1 tmux pane/window via existing WebSocket binary mux
- Tab switching = hide/show xterm container, no reconnection needed
- Backend already multiplexes via `binary-mux.ts` (verified in package exports)

**Confidence:** HIGH — Pure state management over existing infrastructure

---

## Feature 2: AI Chat Overlay

### Recommendation: `ansi_up` v6.0.6 (MIT, 865 stars, zero dependencies)

| Library | Stars | Deps | TypeScript | Streaming | Rec |
|---------|-------|------|------------|-----------|-----|
| ansi_up | 865 | 0 | Yes (.d.ts) | Yes (stateful) | **YES** |
| ansi-to-html | 377 | 0 | No | Yes | NO |

**Why ansi_up:**
- Zero dependencies (important for browser bundle)
- Native TypeScript definitions bundled
- Stateful streaming API (handles partial escape sequences across chunks)
- ES6 module (matches codebase style)
- Active maintenance (v6.0.6 released May 2025)
- Handles 256-color and true-color ANSI codes

**Source:** https://github.com/drudru/ansi_up (verified 2026-03-02)

**Installation:**
```bash
cd packages/web
bun add ansi_up
```

**Custom parsing needed:**
OpenCode terminal output has structured format. Need custom parser to:
1. Detect OpenCode message boundaries (box-drawing characters)
2. Extract role (assistant/user/tool)
3. Strip ANSI for text display, preserve for code blocks
4. Render as chat bubbles with ansi_up for syntax-colored code

```typescript
// Parser detects patterns like:
// ╭─ Assistant ─────────────────────────────
// │ <content>
// ╰─────────────────────────────────────────
interface ChatMessage {
  role: 'assistant' | 'user' | 'tool';
  content: string;      // ANSI stripped for text
  rawContent: string;   // ANSI preserved for code
  timestamp: number;
}
```

**Confidence:** MEDIUM — ansi_up is verified, but custom OpenCode parsing needs iteration

---

## Feature 3: Voice Input (Containerized Whisper)

### Recommendation: `onerahmet/openai-whisper-asr-webservice:latest` (Docker image)

| Option | Model Support | GPU | REST API | Containerized | Rec |
|--------|---------------|-----|----------|---------------|-----|
| whisper-asr-webservice | turbo, large-v3 | Yes | Yes (Swagger) | Yes | **YES** |
| Raw openai/whisper | All | Yes | No | No | NO |
| faster-whisper standalone | All | Yes | No | No | NO |

**Why whisper-asr-webservice:**
- Pre-built Docker image, 1M+ pulls on Docker Hub
- REST API with Swagger documentation (port 9000)
- Supports multiple engines: openai_whisper, faster_whisper, whisperX
- Model caching via volume mount (reduces startup time)
- CPU and GPU variants available (`:latest` vs `:latest-gpu`)
- Production-ready (v1.9.1 released July 2025)

**Sources:**
- GitHub: https://github.com/ahmetoner/whisper-asr-webservice (verified 2026-03-02)
- Docker Hub: https://hub.docker.com/r/onerahmet/openai-whisper-asr-webservice

**Docker Compose addition:**
```yaml
services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest
    # Use :latest-gpu for GPU acceleration
    ports:
      - "9000:9000"
    environment:
      - ASR_MODEL=base  # or turbo for better accuracy
      - ASR_ENGINE=faster_whisper  # 4x faster than openai_whisper
    volumes:
      - whisper_cache:/root/.cache/
volumes:
  whisper_cache:
```

**Integration pattern (server-side):**
```typescript
// Server-side API proxy to Whisper container
async function transcribe(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio_file', audioBlob);
  
  const response = await fetch('http://whisper:9000/asr?output=txt', {
    method: 'POST',
    body: form
  });
  return response.text();
}
```

**Model selection guidance:**
| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| tiny | 39M | 10x | Lower | Quick tests |
| base | 74M | 7x | Good | Default choice |
| small | 244M | 4x | Better | When accuracy matters |
| turbo | 809M | 8x | Best | Optimal speed/accuracy |

**Confidence:** HIGH — Docker image verified, 1M+ pulls, REST API documented

---

## Feature 4: Git Push from Browser

### Recommendation: `simple-git` v3.x (already recommended in base stack)

**Verified capabilities for git push:**
- `.push(remote, branch, [options])` — Full push support
- `.push([options])` — Uses `--verbose --porcelain` for progress parsing
- `.pushTags(remote)` — Push tags
- Progress events via plugin system
- Environment variable injection for auth (`.env()`)

**Source:** https://github.com/steveukx/git-js (3.8k stars, verified 2026-03-02)

**Installation:** Already in base stack recommendations
```bash
cd packages/server
bun add simple-git
```

**Key push implementation:**
```typescript
import { simpleGit, SimpleGit } from 'simple-git';

const git: SimpleGit = simpleGit(worktreePath);

// Push with upstream tracking
await git.push('origin', branch, {
  '--set-upstream': null  // for new branches
});

// Credential handling via environment
git.env('GIT_SSH_COMMAND', 'ssh -o StrictHostKeyChecking=no');
// OR for HTTPS with token
// remote URL: https://<token>@github.com/owner/repo.git
```

**Auth handling strategies:**
1. **SSH keys**: Mount host SSH agent or key files into container, use `GIT_SSH_COMMAND`
2. **HTTPS tokens**: Embed in remote URL or use credential helper
3. **GitHub App tokens**: Generate via API, use as HTTPS basic auth

**UX considerations:**
- Show push progress via simple-git progress plugin
- Handle auth failures with clear error messages
- Show branch diff summary before push confirmation
- Warn if pushing to protected branches

**Confidence:** HIGH — simple-git is mature (3.8k stars), push is core functionality

---

## Integration Points Summary

| New Feature | Integrates With | How |
|-------------|-----------------|-----|
| Multi-tab | xterm.js, binary-mux, tmux | Tab state wraps existing terminal lifecycle |
| AI Chat | xterm.js buffer, new ansi_up | Parse xterm output, convert ANSI to HTML |
| Voice | Docker compose, server API | New sidecar container, server proxies to it |
| Git Push | simple-git, worktree paths | Same pattern as existing git operations |

---

## What NOT to Add for This Milestone

| Library | Why NOT |
|---------|---------|
| `xterm-addon-attach` | Already have custom WebSocket handling via binary-mux |
| `node-whisper` | Requires Python deps in main container, prefer isolated Docker |
| `isomorphic-git` | Confirmed no worktree support (base research), simple-git wraps CLI |
| `ansi-to-html` | No TypeScript, fewer features than ansi_up |
| `xterm-for-react` | Wrapper adds complexity, raw xterm.js works fine |
| Additional state libs | Existing jotai (in web package) handles tab state |

---

## Installation Commands Summary

```bash
# Web package (browser) — new for AI chat
cd packages/web
bun add ansi_up

# Server package — if simple-git not already added
cd packages/server
bun add simple-git

# Docker compose — add whisper service (no npm install)
# See docker-compose.yml modification above
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Multi-tab | HIGH | Pure state management over existing infra |
| ansi_up | HIGH | GitHub verified, active maintenance, zero deps |
| OpenCode parser | MEDIUM | Custom work needed, pattern TBD through iteration |
| Whisper container | HIGH | Docker Hub verified, 1M+ pulls, REST API |
| simple-git push | HIGH | Core feature of mature library |
| Integration | HIGH | All components are additive, no breaking changes |

---

## Sources for Milestone Additions

- **ansi_up v6.0.6**: https://github.com/drudru/ansi_up (May 2025 release) — HIGH
- **whisper-asr-webservice v1.9.1**: https://github.com/ahmetoner/whisper-asr-webservice (July 2025) — HIGH
- **Docker Hub image**: https://hub.docker.com/r/onerahmet/openai-whisper-asr-webservice — HIGH
- **simple-git**: https://github.com/steveukx/git-js (3.8k stars, 1,493 commits) — HIGH
- **xterm.js docs**: https://xtermjs.org/docs/ (v6.0) — HIGH
- **openai/whisper**: https://github.com/openai/whisper (v20250625) — HIGH
