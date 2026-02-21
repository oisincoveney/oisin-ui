# Pitfalls Research

**Domain:** AI Coding Agent Web UI (self-hosted, terminal-based)
**Researched:** 2026-02-21
**Confidence:** HIGH (WebSocket, terminal, Docker) / MEDIUM (tmux edge cases, worktree scaling)

## Critical Pitfalls

These cause rewrites, data loss, or fundamental architecture failure.

---

### Pitfall 1: WebSocket Reconnection Without State Recovery

**What goes wrong:** The WebSocket connection drops (network switch, laptop sleep, mobile data transition, reverse proxy timeout) and the client reconnects, but the terminal shows a blank screen or stale output. The user has lost all visual context of what the agent was doing. This is already a known Paseo problem.

**Why it happens:** Naive WebSocket implementations treat each connection as stateless. When the socket drops, the server creates a new connection but doesn't replay the terminal buffer. The tmux session is still running server-side, but the client has no way to get the current terminal content. Most tutorials show WebSocket with `onclose` + `new WebSocket()` and call it "reconnection" -- but that's just reconnection of the *transport*, not recovery of the *state*.

**How to avoid:**
1. Use tmux's `capture-pane` command to snapshot the visible terminal content on reconnection. When a client reconnects, capture the current pane content and send it as the initial payload before resuming the live stream.
2. Alternatively, use the xterm.js `@xterm/addon-serialize` addon to serialize terminal state server-side (xterm-headless). On reconnect, deserialize and restore.
3. Implement a message sequence numbering protocol: each message from server gets an incrementing ID. On reconnect, client sends last-seen ID; server replays from that point or falls back to full pane capture.
4. Use WebSocket ping/pong (ws library supports this natively) with a 30-second interval to detect dead connections proactively rather than waiting for TCP timeout.
5. Client-side: exponential backoff with jitter for reconnection (1s, 2s, 4s... cap at 30s). Show clear "reconnecting..." UI state.

**Warning signs:**
- Blank terminal after reconnection
- "Connection lost" with no automatic recovery
- User manually refreshing the page to restore terminal state
- Duplicate output after reconnect (replaying already-seen data)

**Phase to address:** Phase 1 (Foundation). This is the core value proposition -- "work from anywhere, reliably." WebSocket reliability is non-negotiable.

---

### Pitfall 2: Terminal Dimension Desync Between xterm.js and tmux PTY

**What goes wrong:** The terminal display shows garbled output -- text overwrites itself, lines wrap incorrectly, full-screen applications (vim, htop, OpenCode's TUI) render as visual garbage. The xterm.js FAQ explicitly documents this: "Characters are being overwritten when wrapped to a new line -- this is typically caused by xterm.js having different dimensions set to the backing pty."

**Why it happens:** Three independent systems must agree on terminal dimensions:
1. **xterm.js** in the browser (knows its rendered pixel size, calculates cols/rows)
2. **The WebSocket relay/daemon** (passes resize events)
3. **tmux** (manages the PTY dimensions for the actual process)

When the browser window resizes, xterm.js calculates new dimensions using `@xterm/addon-fit`. This must propagate through the WebSocket to the daemon, which must call `tmux resize-window` or `resize-pane`. If any step is delayed, dropped, or applied out of order, dimensions desync. This is especially bad because:
- AI agents produce large amounts of output rapidly
- Full-screen TUIs (OpenCode) rely on exact dimensions for cursor positioning
- Multiple connected clients may have different viewport sizes

**How to avoid:**
1. Use `@xterm/addon-fit` and debounce resize events (200ms minimum) before sending over WebSocket. Don't send every pixel of a drag resize.
2. On the daemon side, use `tmux resize-window -t <session> -x <cols> -y <rows>` immediately upon receiving a resize event.
3. On reconnection, ALWAYS send the current terminal dimensions as part of the handshake before any content is streamed.
4. For single-user (our case): tie tmux window size to the connected client's size. If no client is connected, leave dimensions unchanged (so the agent process isn't disturbed).
5. After applying a resize, use `tmux refresh-client` to force a redraw.
6. Handle the race condition: if a resize event arrives while terminal output is being streamed, queue it and apply after the current write batch completes.

**Warning signs:**
- Text overwriting itself horizontally
- Programs like `vim` or `htop` rendering with wrong column count
- Resize flicker (terminal content briefly garbles then corrects)
- OpenCode's TUI display breaking after browser window resize

**Phase to address:** Phase 1 (Foundation). Every terminal interaction depends on this being correct.

---

### Pitfall 3: Orphaned tmux Sessions and Process Leaks

**What goes wrong:** Over days/weeks of use, the Docker container accumulates zombie tmux sessions, orphaned shell processes, and leaked file descriptors. Memory and CPU usage creep up. Eventually the container becomes sluggish or crashes.

**Why it happens:** Each thread creates a tmux session with a running agent process. When a thread is "closed" in the UI:
- The tmux session may not be killed (just detached)
- The agent process (OpenCode) may have spawned child processes (LSP servers, git operations) that aren't in the tmux session's process group
- If the daemon crashes/restarts, it loses track of which tmux sessions it owns
- Git worktrees accumulate on disk but are never pruned

**How to avoid:**
1. **Name tmux sessions deterministically** using a convention like `oisin-{project}-{thread-id}`. On daemon startup, enumerate all tmux sessions matching the prefix and reconcile with the database of known threads.
2. **Implement a session reaper**: periodic check (every 5 minutes) that lists all tmux sessions, compares against active threads, and kills orphans older than a configurable threshold.
3. **Kill session, not just detach**: When removing a thread, use `tmux kill-session -t <name>` which sends SIGHUP to all processes in the session.
4. **Use tmux's `set-option -g destroy-unattached on`** carefully -- this auto-destroys sessions when no client is attached. Good for transient sessions, dangerous for persistent agent sessions. Better to manage lifecycle explicitly.
5. **Store tmux session name in thread metadata**: The database should track `{ threadId, tmuxSession, worktreePath, createdAt, lastActive }` for cleanup.
6. **Git worktree cleanup**: When deleting a thread, run `git worktree remove <path>` then `git worktree prune`. Never just `rm -rf` the worktree directory -- that corrupts git's worktree tracking (the `.git/worktrees/<name>` metadata becomes stale).

**Warning signs:**
- `tmux ls` shows sessions that don't correspond to any UI thread
- Docker container memory growing over days
- `git worktree list` shows "prunable" entries
- Disk space running low in the container

**Phase to address:** Phase 1/2 (Foundation + Thread Management). Build the session lifecycle manager early, before accumulating technical debt.

---

### Pitfall 4: Docker Single-Container Process Management Antipatterns

**What goes wrong:** The Docker container runs the Node.js daemon, tmux server, and multiple agent processes. Process signals don't propagate correctly, the container doesn't shut down cleanly, and crash recovery is unreliable.

**Why it happens:** Docker containers are designed for single-process workloads. Running multiple processes (Node.js daemon + tmux + N agent processes) creates several problems:
- PID 1 in Docker doesn't forward signals by default. `docker stop` sends SIGTERM to PID 1, but if that's `node`, it may not forward to child processes.
- If the daemon crashes, tmux sessions keep running but are now unmanaged.
- Container restart kills all tmux sessions, losing agent work in progress.
- Node.js child_process.spawn doesn't handle process groups well by default.

**How to avoid:**
1. **Use a lightweight init system as PID 1**: Use `tini` (Docker's `--init` flag) or `dumb-init`. This ensures signal propagation to all child processes. Add `ENTRYPOINT ["/tini", "--"]` to the Dockerfile.
2. **Use a process supervisor**: Consider `supervisord` or a simple bash script that starts tmux server, then the Node.js daemon, and handles restarts. But keep it minimal -- don't turn Docker into a full VM.
3. **Graceful shutdown handler in Node.js**: Listen for SIGTERM/SIGINT, enumerate all managed tmux sessions, send `tmux kill-server` or individually kill sessions, then exit. Set `docker stop --timeout=30` to give time for cleanup.
4. **Daemon recovery on restart**: On startup, scan for existing tmux sessions (they may have survived a daemon restart). Reattach to known sessions rather than creating new ones.
5. **Health check**: Docker HEALTHCHECK that verifies both the Node.js daemon is responding AND the tmux server is running.
6. **Volumes for persistence**: Mount git repos and worktrees on a Docker volume, not in the container's ephemeral filesystem. This way, `docker restart` preserves the code even if tmux sessions are lost.

**Warning signs:**
- `docker stop` takes 10+ seconds (waiting for SIGKILL timeout)
- Agent processes continuing after daemon crash
- Lost work after container restart
- Zombie processes visible in `docker exec <container> ps aux`

**Phase to address:** Phase 1 (Docker packaging). Get this right from day one. Retrofitting process management is painful.

---

## Technical Debt Patterns

These don't break immediately but compound over time.

---

### Debt 1: Coupling WebSocket Protocol to UI State

**What goes wrong:** The WebSocket message format becomes an implicit API that's impossible to version. Adding new features requires changing both daemon and client simultaneously, making rolling updates impossible.

**How to avoid:**
1. Define a versioned message protocol from day one. Every message should have `{ type: string, version: number, payload: any }`.
2. Separate concerns: terminal data stream (binary, high-volume) from control messages (JSON, low-volume). Use different WebSocket message types or even separate connections.
3. The daemon should be able to serve clients at version N and N-1 simultaneously.

**Phase to address:** Phase 1. The protocol is the hardest thing to change later.

---

### Debt 2: Monolith tmux Configuration

**What goes wrong:** All tmux sessions share the same global configuration. Changing a setting for one use case (e.g., scrollback buffer size for a heavy-output agent) affects all sessions.

**How to avoid:**
- Set session-specific options: `tmux set-option -t <session> history-limit 50000` rather than global `-g`.
- Use `-f /dev/null` when starting the tmux server to avoid loading user config, then apply your own configuration programmatically.
- Per-thread tmux config is overkill for now but keep the option open.

**Phase to address:** Phase 2 (Thread Management). Not critical initially but prevents surprises.

---

### Debt 3: Not Using tmux Control Mode

**What goes wrong:** The daemon communicates with tmux by running `tmux` CLI commands (spawn a child process for each operation). This is slow, creates process overhead, and makes it hard to receive asynchronous events from tmux.

**How to avoid:**
- Consider tmux's control mode (`tmux -C` or `tmux attach -t <session> -C`). In control mode, tmux communicates via structured text over stdin/stdout instead of a terminal. This enables:
  - Receiving output notifications without polling
  - Sending commands without spawning processes
  - Getting structured responses
- iTerm2 uses this approach extensively for its tmux integration.
- However, control mode has its own complexity. For v1, CLI commands are fine. Plan the abstraction layer so you can swap later.

**Phase to address:** Phase 3+ (Optimization). CLI commands work fine initially. Migrate if performance becomes an issue.

---

## Integration Gotchas

Specific to combining the technologies in this stack.

---

### Gotcha 1: xterm.js `addon-fit` Requires Visible Container

**What goes wrong:** `FitAddon.fit()` returns 0 cols / 0 rows (or throws) because it's called when the terminal's DOM container has `display: none` or zero dimensions. This happens when:
- Terminal is in a hidden tab
- Terminal is in a collapsed sidebar panel
- Component mounts before the container is laid out

**How to avoid:**
1. Only call `fit()` when the terminal container is visible and has non-zero dimensions.
2. Use a ResizeObserver on the container element and call `fit()` in the callback, not on window resize.
3. When switching between threads/tabs, call `fit()` after the tab transition completes and the container is visible.
4. Guard: `if (container.offsetWidth === 0 || container.offsetHeight === 0) return;`

**Phase to address:** Phase 1. This will bite you immediately when building the multi-panel layout.

---

### Gotcha 2: xterm.js WebGL Renderer Context Loss

**What goes wrong:** The terminal goes blank (white or black rectangle) and stops rendering. No error in the console. This happens when:
- The browser tab is backgrounded for a long time
- The system resumes from sleep
- GPU driver issues (especially on Linux)
- Too many WebGL contexts (each xterm.js terminal with WebGL addon uses one)

**How to avoid:**
1. Start with the **canvas renderer** (default), not WebGL. WebGL is faster but more fragile. For a coding agent UI where you might have 3-5 visible terminals, canvas is fine.
2. If using WebGL: listen for `webglcontextlost` events on the canvas and reinitialize the renderer.
3. `terminal.clearTextureAtlas()` can fix corruption issues after OS sleep (documented in xterm.js API).
4. Limit the number of simultaneously rendered terminals. Terminals in background tabs should be detached/disposed and recreated when the tab is focused.

**Phase to address:** Phase 2 (UI polish). Start with canvas renderer. Consider WebGL only if performance is measurably bad.

---

### Gotcha 3: git worktree + Branch Checkout Restrictions

**What goes wrong:** `git worktree add` fails with "fatal: '<branch>' is already checked out at '<path>'" because git prevents the same branch from being checked out in multiple worktrees simultaneously.

**Why this matters:** If two threads are working on the same branch (e.g., `main`), the second thread can't create its worktree. This is a fundamental git safety mechanism to prevent index corruption.

**How to avoid:**
1. **Always create a new branch per thread**: `git worktree add ../thread-<id> -b thread/<project>/<id> <base-branch>`. This sidesteps the restriction entirely.
2. **Never try to check out the same branch in two worktrees**. The UI should enforce this -- if a user tries to create a thread on a branch already in use, warn them.
3. **Use `--detach` for read-only threads**: If a thread only needs to view code, `git worktree add --detach <path> <commit>` avoids branch conflicts.
4. **Cleanup properly**: `git worktree remove <path>` then `git worktree prune`. The git documentation explicitly warns: "If a working tree is deleted without using `git worktree remove`, then its associated administrative files ... will eventually be removed automatically."
5. **Watch for the BUGS section warning**: The official git-worktree docs state: "Multiple checkout in general is still experimental, and the support for submodules is incomplete. It is NOT recommended to make multiple checkouts of a superproject." If your projects use submodules, this is a real risk.

**Phase to address:** Phase 2 (Thread Management). Design the branch-per-thread strategy early.

---

### Gotcha 4: Expo Web + Native Terminal Library Conflict

**What goes wrong:** xterm.js is a DOM-dependent library. Expo/React Native's web build may interfere with direct DOM manipulation. SSR (if used) will crash because xterm.js requires `window` and `document`.

**How to avoid:**
1. **Lazy-load xterm.js**: Dynamic import `const { Terminal } = await import('@xterm/xterm')` only in browser context.
2. **Use `Platform.OS === 'web'` guards** in Expo to ensure terminal code only runs on web.
3. **Don't render xterm.js in React's reconciler**: Use a `ref` to get the DOM element, instantiate `Terminal` imperatively, and manage it outside React's lifecycle. React should own the container div but NOT the terminal contents.
4. **Since you're web-only for v1**: Consider whether Expo web is actually needed vs. a plain React/Vite app. Expo web adds complexity for mobile compatibility you're explicitly deferring.

**Phase to address:** Phase 1 (Architecture decision). Decide early whether to keep Expo web or simplify.

---

## Performance Traps

---

### Trap 1: Unbounded Terminal Scrollback in Long-Running Agent Sessions

**What goes wrong:** AI coding agents produce enormous amounts of output (compilation logs, test results, file contents, chain-of-thought). A single session can generate megabytes of terminal output. Both xterm.js and tmux store this in memory. After hours/days, memory usage balloons.

**How to avoid:**
1. Set explicit tmux scrollback limits: `tmux set-option -t <session> history-limit 10000` (default is 2000). For agent sessions, 10,000-20,000 lines is a reasonable cap.
2. Set xterm.js scrollback limit: `new Terminal({ scrollback: 5000 })`. This is the client-side buffer. It can be smaller than tmux's because you can always re-capture from tmux.
3. **Do NOT set unlimited scrollback**. It's tempting because agents produce valuable output, but it will cause memory issues.
4. Consider persisting important output separately (e.g., saving chat transcripts to files) rather than relying on terminal scrollback as the archive.

**Phase to address:** Phase 1. Set conservative defaults. Tune later based on real usage.

---

### Trap 2: Streaming Large Diffs Through WebSocket

**What goes wrong:** When an agent modifies many files, the diff view tries to compute and transmit large diffs over WebSocket in real-time. This saturates the connection, causes UI lag, and can crash the browser tab.

**How to avoid:**
1. **Never stream raw diff output through the terminal WebSocket**. Compute diffs on the daemon side and send structured data (file list + per-file diffs) on a separate channel.
2. **Paginate diffs**: Send file list first, load individual file diffs on demand when the user clicks.
3. **Debounce diff computation**: Don't recompute on every file change. Use a 1-2 second debounce after the last filesystem change event.
4. **Set a max diff size**: If a single file diff exceeds N KB (e.g., 100KB), show "Large diff -- click to load" instead of rendering inline.

**Phase to address:** Phase 2/3 (Diff view). Design the diff data flow separately from the terminal stream.

---

### Trap 3: Too Many Simultaneous xterm.js Instances

**What goes wrong:** Each xterm.js Terminal instance creates a canvas element, a render loop, and a buffer in memory. With 10+ threads each having a terminal, even backgrounded ones consume resources. The page becomes sluggish.

**How to avoid:**
1. **Only render terminals for the active thread**. When switching threads, dispose the previous terminal and create a new one for the current thread.
2. **Keep terminal state on the server** (tmux sessions persist regardless of client). The client is just a view -- it can be destroyed and recreated cheaply.
3. **Lazy instantiation**: Don't create a Terminal until the user actually views that thread.
4. On reconnect/tab switch, use `tmux capture-pane` to get current content and write it to the fresh terminal instance.

**Phase to address:** Phase 2 (Multi-thread UI). Critical for the multi-thread experience to feel fast.

---

## Security Mistakes

---

### Mistake 1: Exposing Docker Socket or Daemon API Without Auth

**What goes wrong:** The daemon listens on a port for WebSocket connections. Without authentication, anyone who can reach the port can interact with your terminal sessions -- effectively getting shell access to your machine.

**How to avoid:**
1. **Phase 1 (local only)**: Bind to `127.0.0.1` only. Docker port mapping: `-p 127.0.0.1:8080:8080`.
2. **When exposing remotely**: Use a reverse proxy (nginx/Caddy) with HTTPS + basic auth or token auth at minimum.
3. **Never expose the daemon port directly to the internet**. Even "single user" tools get accidentally exposed.
4. **API tokens**: Generate a random token on first run, require it in WebSocket connection headers. Store in a config file the user can reference.
5. **WSS (WebSocket Secure)**: When behind HTTPS, WebSocket upgrades to WSS automatically. But if using bare WebSocket without a reverse proxy, add TLS support to the daemon.

**Phase to address:** Phase 1 (Foundation -- bind to localhost). Phase 3+ for remote access auth.

---

### Mistake 2: Terminal Injection via Agent Output

**What goes wrong:** The AI agent's output contains escape sequences that, when rendered in xterm.js, could: change the terminal title (used for phishing), set clipboard content (if clipboard addon is enabled), or trigger link handler behavior.

**How to avoid:**
1. xterm.js is generally safe -- it's designed to render untrusted terminal output. But be careful with addons:
   - `@xterm/addon-clipboard`: Only enable if you trust the source
   - `linkHandler`: Validate URLs start with `https://` before opening
2. **Don't reflect terminal output into HTML outside xterm.js** (e.g., in chat views or logs) without sanitizing escape sequences first.
3. This is low-risk for a personal tool but worth documenting.

**Phase to address:** Phase 2+. Low priority for single-user but good hygiene.

---

## UX Pitfalls

---

### UX 1: "I Can't Tell If the Agent Is Working or Stuck"

**What goes wrong:** The agent is thinking (waiting for API response) but the terminal shows no output. The user can't distinguish "working" from "hung" from "disconnected."

**How to avoid:**
1. **Activity indicators**: Watch for terminal output. If no output for >5 seconds, show a subtle "waiting..." indicator.
2. **WebSocket heartbeat UI**: Show connection status clearly (connected / reconnecting / disconnected).
3. **tmux session status**: Periodically check if the agent process is still running via `tmux list-panes -t <session> -F '#{pane_pid}'` and verify the PID is alive.
4. **Don't rely on terminal output alone** for status. Add a daemon-level status channel that reports agent process state.

**Phase to address:** Phase 2 (UI polish).

---

### UX 2: Copy/Paste Doesn't Work as Expected in Browser Terminal

**What goes wrong:** The user tries to select text in the terminal and gets unexpected behavior: browser text selection interferes with xterm.js selection, Ctrl+C kills the process instead of copying, right-click behavior is wrong.

**How to avoid:**
1. **Use xterm.js's built-in selection** (it handles this well by default).
2. **Bind Ctrl+Shift+C / Ctrl+Shift+V** for copy/paste (standard terminal convention). Document this somewhere visible.
3. **On macOS**: Cmd+C/Cmd+V work natively. Set `macOptionIsMeta: true` in xterm.js options so Option key works correctly for terminal shortcuts.
4. **Enable `rightClickSelectsWord: true`** for macOS-like behavior.

**Phase to address:** Phase 1 (Terminal integration). Small but critical for usability.

---

### UX 3: Lost Context When Switching Between Threads

**What goes wrong:** User switches from Thread A to Thread B, then back to Thread A, and the terminal is empty or shows stale content. They've lost context of what was happening.

**How to avoid:**
1. This is really a sub-case of Pitfall 1 (state recovery). When switching threads, treat it like a reconnection:
   - Destroy the current xterm.js instance
   - Create a new one
   - Capture the target thread's tmux pane content
   - Write it to the new terminal
   - Attach to the live stream
2. Consider keeping a **lightweight state cache** on the client: last ~100 lines per thread, so switching feels instant while the full capture loads.

**Phase to address:** Phase 2 (Multi-thread UI).

---

## "Looks Done But Isn't" Checklist

Things that demo well but fail in real use.

| Feature | Demo Version | Production Version |
|---------|-------------|-------------------|
| Terminal rendering | Shows output from a simple command | Handles full-screen TUIs (vim, htop, OpenCode), ANSI colors, Unicode, resize |
| WebSocket connection | Works on localhost | Survives network switches, laptop sleep, 8-hour sessions, mobile data |
| Thread creation | Creates a worktree and tmux session | Handles naming conflicts, cleanup on delete, recovery after crash, disk space |
| Docker container | Starts and shows the UI | Graceful shutdown, process cleanup, volume persistence, health checks |
| Multi-thread | Switching between 2 threads | 10+ threads with lazy loading, background terminals disposed, fast switching |
| Diff view | Shows `git diff` output | Handles large diffs, binary files, renamed files, new files, merge conflicts |
| Resize | Terminal resizes when window changes | Resize propagates to tmux, debounced, works across reconnect, no garbled output |

---

## Recovery Strategies

When things go wrong despite prevention.

| Failure | Recovery |
|---------|----------|
| WebSocket won't reconnect | Client falls back to polling endpoint that returns connection status. UI shows "reconnecting" with manual "retry" button. |
| Orphaned tmux sessions | Admin endpoint: `GET /api/admin/sessions` lists all tmux sessions with their match status. `DELETE /api/admin/sessions/:name` force-kills. |
| Terminal dimension desync | "Reset terminal" button that sends `tmux resize-pane` + `terminal.reset()` + re-fit. |
| Docker container OOM | Set container memory limit. Monitor with HEALTHCHECK. Auto-restart policy. |
| Corrupted git worktree | `git worktree repair` command. If that fails, `git worktree remove --force` + recreate. |
| Daemon crash with running sessions | On restart, daemon discovers existing tmux sessions via `tmux ls`, reconciles with stored state, reattaches. |

---

## Pitfall-to-Phase Mapping

| Phase | Critical Pitfalls to Address | Warning: Watch For |
|-------|-----------------------------|--------------------|
| **Phase 1: Foundation** | WebSocket state recovery (#1), Dimension sync (#2), Docker process management (#4), Protocol versioning (Debt 1), xterm.js fit visibility (Gotcha 1), Scrollback limits (Trap 1), Localhost binding (Security 1), Copy/paste UX (UX 2) | Don't over-engineer reconnection -- get basic capture-pane working first |
| **Phase 2: Thread Management** | Orphaned session cleanup (#3), Branch-per-thread strategy (Gotcha 3), Lazy terminal instances (Trap 3), Thread switching UX (UX 3), Agent status indicators (UX 1) | Worktree cleanup is easy to defer and painful to retrofit |
| **Phase 3: Diff & Polish** | Large diff handling (Trap 2), WebGL context recovery (Gotcha 2) | Diffs are a separate data channel, don't mix with terminal stream |
| **Phase 4: Remote Access** | Authentication (Security 1 -- full version), WSS, Reverse proxy compatibility | Test with real network conditions (high latency, packet loss) |

---

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| xterm.js FAQ (xtermjs/xterm.js wiki) -- dimension desync documentation | Official docs | HIGH |
| xterm.js v6.0.0 TypeScript declarations -- API for Terminal, fit, serialize addons | Official API | HIGH |
| git-worktree documentation (git-scm.com/docs/git-worktree, v2.53.0) -- BUGS section, branch checkout restrictions | Official docs | HIGH |
| tmux man page (man7.org) -- control mode, session management, socket architecture, signal handling | Official docs | HIGH |
| Paseo v0.1.15 repository (github.com/getpaseo/paseo) -- architecture, known limitations | Primary source | HIGH |
| ttyd project (github.com/tsl0922/ttyd) -- reference terminal-over-web implementation, WebSocket ping interval | Reference impl | HIGH |
| Docker PID 1 signal propagation, tini/dumb-init patterns | Well-known patterns | HIGH |
| PROJECT.md -- known Paseo problems, architecture constraints | Project context | HIGH |
| WebSocket reconnection with exponential backoff patterns | Training knowledge | MEDIUM |
| tmux control mode real-world usage patterns | Training knowledge | MEDIUM |
| xterm.js WebGL context loss behavior | Training knowledge + xterm.js API docs | MEDIUM |
