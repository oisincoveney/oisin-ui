# Phase 02: Terminal I/O - Research

**Researched:** 2026-02-21
**Domain:** Browser terminal streaming + tmux session persistence + reconnect/replay semantics
**Confidence:** HIGH

## Summary

This phase should be planned as a resumable byte-stream terminal system, not as a "live socket mirror". The repo already has the core primitives for this model: binary mux framing (`packages/server/src/shared/binary-mux.ts`), stream attach/resume/ack in session handling (`packages/server/src/server/session.ts`), WebSocket heartbeat + reconnect grace keyed by `clientSessionKey` (`packages/server/src/server/websocket-server.ts`), and a mature reconnecting terminal client in `DaemonClient` (`packages/server/src/client/daemon-client.ts`).

For the browser terminal UI, xterm.js 6 is the correct standard with Fit + WebGL addons. Use `ResizeObserver` + debounced backend resize, but keep stream output flowing during debounce. Keep disconnect UX in the existing overlay (no terminal banner lines), blur terminal visually, and leave selection/copy working.

For persistence/recovery, tmux remains the source of truth. On first load/hard refresh, hydrate from full tmux scrollback. On transient socket reconnect, re-attach stream with `resumeOffset`; if offset range is unavailable, force a reset redraw from server + tmux scrollback catch-up. This matches TERM-01..TERM-04 and the locked context decisions.

**Primary recommendation:** Reuse the existing binary stream + ack + reconnect architecture from server/client internals, and implement browser xterm as a thin rendering/input adapter over that protocol with tmux-backed replay.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xterm/xterm` | `6.0.0` | Browser terminal emulator | Official terminal UI with robust VT handling, full-screen app compatibility, and active API docs |
| `@xterm/addon-fit` | same major as xterm | Fit terminal to container dimensions | Official addon pattern for cols/rows synchronization |
| `@xterm/addon-webgl` | same major as xterm | GPU renderer for high-throughput output | Official performance path; supports context-loss handling |
| `tmux` | `3.5a+` recommended | Session persistence across disconnect/reconnect | Native detach/attach model, scrollback capture, stable CLI automation |
| existing binary mux (`packages/server/src/shared/binary-mux.ts`) | in-repo | Framed terminal input/output/ack with offsets | Already integrated end-to-end in daemon session handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ws` (server) | `8.x` | WebSocket server + ping/pong heartbeat | Keep server-side liveness checks and dead-connection termination |
| Browser `WebSocket` (`binaryType=arraybuffer`) | Web standard | Receive/send binary mux frames | Required for offset replay + ack framing in web terminal |
| `ResizeObserver` | Web standard (baseline since 2020) | Container-driven terminal resize detection | Use for fit+resize propagation in responsive layouts |
| existing `DaemonClient` patterns | in-repo | Backoff/reconnect stream semantics | Use as implementation reference; avoid inventing new reconnect protocol |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| current in-repo reconnect logic | `reconnecting-websocket` | Simpler API, but project appears stale (latest release shown 2020) and does not natively solve offset replay/ack semantics |
| custom framed stream | `@xterm/addon-attach` | Attach addon is simple passthrough WebSocket, but lacks required resume offsets, replay flags, and ack window control |
| tmux persistence | long-lived node-pty shell only | Fewer layers, but weaker crash/restart recovery and poorer historical reconstruction guarantees |

**Installation:**
```bash
npm --workspace packages/web install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl
```

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
├── terminal/
│   ├── TerminalView.tsx          # xterm mount/open/dispose + addons
│   ├── terminal-stream.ts        # binary mux decode/encode + offset bookkeeping
│   ├── terminal-reconnect.ts     # backoff state machine + reconnect logging
│   └── terminal-resize.ts        # ResizeObserver + debounced resize RPC
├── components/
│   └── ConnectionOverlay.tsx     # existing disconnected/reconnecting overlay
└── lib/
    └── ws.ts                     # websocket lifecycle (or replaced by terminal-reconnect)
```

### Pattern 1: Stream Attach With Offset Resume
**What:** Attach terminal stream with `resumeOffset`, consume output chunks, ack highest applied offset.
**When to use:** Every reconnect and first stream bind after terminal selection.
**Example:**
```typescript
// Source: in-repo daemon-client/session protocol + binary mux
const attach = await client.attachTerminalStream(terminalId, {
  resumeOffset: lastAppliedOffset,
  rows,
  cols,
});

if (attach.reset) {
  // Local offset is stale: clear and redraw from authoritative server state
  await fullRedrawFromTmux();
}

const off = client.onTerminalStreamData(attach.streamId!, (chunk) => {
  term.write(chunk.data); // Uint8Array UTF-8 write is supported in xterm v6
  lastAppliedOffset = chunk.endOffset;
  client.sendTerminalStreamAck(chunk.streamId, chunk.endOffset);
});
```

### Pattern 2: Full Redraw on Non-Refresh Reconnect
**What:** For socket drops without hard refresh, clear terminal and redraw from server/tmux before resuming live stream.
**When to use:** `close/error` reconnect path where tab state is still alive.
**Example:**
```typescript
// Source: context decisions + attach response reset semantics
term.clear();
const snapshot = await fetchFullScrollbackFromServer();
term.write(snapshot);
term.scrollToBottom();
```

### Pattern 3: Resize Propagation (UI -> xterm -> daemon -> tmux)
**What:** Detect container resize, run `fit()`, debounce backend resize RPC, keep incoming output flowing.
**When to use:** Window resize, layout change, fullscreen toggles, tab visibility return.
**Example:**
```typescript
// Source: xterm Terminal.resize docs (debounce recommended), MDN ResizeObserver
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const ro = new ResizeObserver(() => {
  fitAddon.fit();
  scheduleDebouncedResize({ cols: term.cols, rows: term.rows });
});

ro.observe(containerEl);
```

### Pattern 4: Heartbeat + Infinite Reconnect
**What:** Use server ping/pong heartbeat, client exponential backoff with no max retry cap.
**When to use:** Always-on terminal session connectivity.
**Example:**
```typescript
// Source: packages/server/src/server/websocket-server.ts
// Server heartbeat: ping every 30s, terminate if previous pong missing.
const HEARTBEAT_INTERVAL_MS = 30_000;
```

### Anti-Patterns to Avoid
- **Raw text stream without offsets:** cannot prove replay completeness after reconnect.
- **Character-count offsets:** breaks on UTF-8 multibyte boundaries; offsets must be byte-based.
- **Resize spam to tmux per frame:** causes TUI jitter/garble; debounce server resize calls.
- **Dual reconnect engines at once:** avoid stacking browser native retries + custom timers + library retries.
- **Overlay that disables selection:** violates explicit requirement to preserve copy from frozen terminal.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VT parsing/rendering | Custom canvas terminal | `@xterm/xterm` + official addons | Full escape-sequence compatibility is large and error-prone |
| Binary framing | Ad-hoc JSON chunk protocol | existing `binary-mux.ts` frame format | Already supports channels, stream IDs, offsets, replay flags, ack |
| Session persistence | Homegrown process checkpointing | tmux sessions + capture-pane | Built for detach/attach, scrollback, and long-lived TUI workflows |
| Liveness detection | Custom half-open detection heuristics | `ws` ping/pong heartbeat pattern | Standard, proven dead-socket handling |
| Backpressure windowing | Unbounded send queues | existing ack window (`TERMINAL_STREAM_WINDOW_BYTES`) | Prevents runaway buffering and OOM on slow clients |

**Key insight:** Terminal reliability is mostly protocol discipline (offsets/acks/resets) plus authoritative session state (tmux), not UI complexity.

## Common Pitfalls

### Pitfall 1: Offset Drift After Partial Buffer Loss
**What goes wrong:** Client resumes from an offset the server no longer has in RAM buffer.
**Why it happens:** Bounded in-memory chunk retention (`maxRawBufferBytes` / pending windows).
**How to avoid:** Respect `attach_terminal_stream_response.reset`; force full redraw from tmux scrollback.
**Warning signs:** `replayedFrom` > requested offset; missing lines after reconnect.

### Pitfall 2: Garbled Vim/OpenCode After Resizes
**What goes wrong:** Full-screen terminal apps render incorrectly after browser/container resize.
**Why it happens:** Unsynchronized cols/rows across xterm, websocket payload, and tmux window size policy.
**How to avoid:** Fit immediately in UI, debounce backend resize, ensure tmux window sizing strategy is explicit (`window-size` behavior + `resize-window`/client sizing semantics).
**Warning signs:** Wrapped prompts, broken line drawing, cursor displacement.

### Pitfall 3: WebGL Renderer Context Loss
**What goes wrong:** Blank or corrupted terminal after sleep/wake/GPU pressure.
**Why it happens:** WebGL context loss is normal browser behavior.
**How to avoid:** Handle `onContextLoss` and dispose/recreate `WebglAddon`; call `term.refresh(...)` after tab re-focus.
**Warning signs:** Terminal stops painting while stream still arrives.

### Pitfall 4: Reconnect UX Race Conditions
**What goes wrong:** Input leaks through during disconnect or stale keystrokes execute after reconnect.
**Why it happens:** Overlay and socket state updates are not immediate/atomic.
**How to avoid:** Flip disconnected UI state immediately on `close/error`, block pointer events via overlay, drop queued keystrokes during disconnected state.
**Warning signs:** Unexpected command execution right after reconnect.

### Pitfall 5: Misuse of `capture-pane`
**What goes wrong:** Missing content, wrapped lines split, or lost colors during catch-up.
**Why it happens:** Wrong flags/ranges (default captures only visible pane).
**How to avoid:** Use `capture-pane -p -S- -E-` for full history; add `-e` when ANSI/color fidelity is needed; use `-J` when wrapped-line join is required.
**Warning signs:** Catch-up text differs from live terminal output formatting.

## Code Examples

Verified patterns from official sources:

### xterm + Fit + WebGL bootstrap
```typescript
// Source: xterm docs + addon readmes
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

const term = new Terminal({
  allowProposedApi: false,
  convertEol: false,
  scrollback: 10000,
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const webglAddon = new WebglAddon();
webglAddon.onContextLoss(() => webglAddon.dispose());
term.loadAddon(webglAddon);

term.open(container);
fitAddon.fit();
```

### tmux full scrollback capture for redraw/catch-up
```bash
# Source: tmux man page capture-pane command
tmux capture-pane -p -t "$PANE_ID" -S- -E-
```

### ws heartbeat pattern (server)
```typescript
// Source: ws README heartbeat FAQ pattern
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON-only terminal events | Binary mux frames with stream/offset/ack | Already in current repo | Enables loss-aware replay and bounded backpressure |
| Stateless reconnect (just reopen socket) | Resume by offset + reset redraw fallback | Current repo architecture | Prevents silent gaps after transient disconnects |
| Polling window size from viewport only | `ResizeObserver` + fit + debounced backend resize | Browser baseline matured (widely available) | Better correctness for split/fullscreen/layout transitions |
| Pure node-pty session persistence | tmux-backed persistent sessions | Locked project decision | Session continuity survives UI disconnects and long-running tasks |

**Deprecated/outdated:**
- `reconnecting-websocket` as primary strategy: still usable, but appears stale and does not cover terminal replay semantics.
- Building terminal diffs from cell snapshots as primary transport: much heavier than byte-stream + replay, weaker for exact TUI fidelity.

## Open Questions

1. **How exactly to map "single session naming based on current directory" into future Phase 3 multi-thread IDs?**
   - What we know: Phase 2 wants one tmux session auto-created from current directory name.
   - What's unclear: deterministic migration path to `project/thread` naming without breaking reconnection.
   - Recommendation: define and store a stable `terminalSessionKey` now (independent from display name).

2. **Should catch-up prefer tmux capture-pane always or only on offset reset?**
   - What we know: Context requires full scrollback on hard refresh and catch-up for missed output.
   - What's unclear: tradeoff between always-redraw simplicity vs incremental replay efficiency.
   - Recommendation: use incremental replay by default; use capture-pane full redraw when `reset=true` or on explicit "refresh from server" reconnect path.

## Sources

### Primary (HIGH confidence)
- xterm.js docs (v6): https://xtermjs.org/docs/
- xterm Terminal API (v6): https://xtermjs.org/docs/api/terminal/classes/terminal/
- xterm addon docs/readmes (fit/webgl/serialize/attach):
  - https://raw.githubusercontent.com/xtermjs/xterm.js/master/addons/addon-fit/README.md
  - https://raw.githubusercontent.com/xtermjs/xterm.js/master/addons/addon-webgl/README.md
  - https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/addons/addon-serialize/README.md
  - https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/addons/addon-attach/README.md
- xterm package metadata (6.0.0): https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/package.json
- tmux manual (capture-pane/resize/new-session/window-size): https://man.openbsd.org/tmux.1
- ws heartbeat pattern: https://raw.githubusercontent.com/websockets/ws/master/README.md
- In-repo protocol/runtime references:
  - `packages/server/src/shared/binary-mux.ts`
  - `packages/server/src/server/session.ts`
  - `packages/server/src/server/websocket-server.ts`
  - `packages/server/src/shared/messages.ts`
  - `packages/server/src/client/daemon-client.ts`

### Secondary (MEDIUM confidence)
- tmux Advanced Use wiki (supplementary usage patterns): https://github.com/tmux/tmux/wiki/Advanced-Use
- MDN WebSocket + ResizeObserver operational guidance:
  - https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType
  - https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
  - https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver

### Tertiary (LOW confidence)
- `reconnecting-websocket` README/release metadata (maintenance freshness signal):
  - https://raw.githubusercontent.com/pladaria/reconnecting-websocket/master/README.md
  - https://github.com/pladaria/reconnecting-websocket

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - validated by official docs + current in-repo implementations
- Architecture: HIGH - directly grounded in existing server/client stream protocol and requirements context
- Pitfalls: MEDIUM - mix of official docs and production-pattern inference

**Research date:** 2026-02-21
**Valid until:** 2026-03-23
