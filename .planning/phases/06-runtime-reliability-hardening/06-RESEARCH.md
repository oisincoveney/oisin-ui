# Phase 06: Runtime Reliability Hardening - Research

**Researched:** 2026-02-25
**Domain:** Web client + daemon runtime resilience (WebSocket reconnect, terminal attach lifecycle, thread create/delete state recovery)
**Confidence:** HIGH

## Summary

Phase 06 is primarily a state-machine hardening phase across existing paths, not a new subsystem phase. Core behavior already exists in `packages/web/src/lib/ws.ts` (transport reconnect), `packages/web/src/App.tsx` (terminal attach/reattach), `packages/web/src/thread/thread-store.ts` (create/delete/switch state), and `packages/server/src/server/session.ts` (attach/input/ensure/thread handlers). Failures now are boundary semantics: stale IDs after restart, unbounded retries/loops, and UI state transitions that are correct eventually but not immediate/bounded.

Standard approach for this codebase: keep transport reconnect independent, add explicit recovery state at UI/store layer, and bound all retry windows with request/cycle correlation. Do not replace current architecture (Jotai stores + requestId maps + server session protocol); extend it with explicit runtime recovery metadata and deterministic transitions.

The most important planning choice is to implement this as small vertical slices (RUN-03 and RUN-04 first, then RUN-02, then RUN-01 polish), each with deterministic checks. Existing stack supports this well.

**Primary recommendation:** Add a first-class `runtimeRecovery` state machine in web store(s), key it to daemon `server_info.serverId` + attach outcomes, enforce bounded retry/timeouts (60s attach window, finite create timeout), and gate risky actions during post-restart warm-up.

## Current Code Paths (Likely Involved)

### Reconnect and transport lifecycle
| Area | Files/Modules | What exists now | Gap vs Phase 06 |
|------|---------------|-----------------|-----------------|
| WebSocket lifecycle | `packages/web/src/lib/ws.ts` | Exponential reconnect, status transitions, diagnostics, send returns `false` if not open | No jitter; no daemon restart identity handling; no explicit warm-up state |
| Connection UI | `packages/web/src/components/ConnectionOverlay.tsx` | Overlay for connecting/reconnecting/disconnected, attach+ws reason display | No attach retry countdown/progress window semantics |
| App wiring | `packages/web/src/App.tsx` | Status-driven attach flow, `attachCycleRef` stale response guard | Attach failure only surfaced as text; no bounded retry scheduler with indicator |

### Terminal attach lifecycle
| Area | Files/Modules | What exists now | Gap vs Phase 06 |
|------|---------------|-----------------|-----------------|
| Attach request/response | `packages/web/src/App.tsx` (`sendAttachRequest`, `attach_terminal_stream_response`) | RequestId + cycle correlation; resume offset fallback to force refresh | No 60s retry window policy; no explicit fail terminal state after window |
| Input stream adapter | `packages/web/src/terminal/terminal-stream.ts` | StreamId-gated binary input/ack, input disabled when disconnected | Explicitly does not buffer input (`clearPendingInput` no-op), conflicts with queued-send decision |
| Daemon attach handling | `packages/server/src/server/session.ts` (`handleAttachTerminalStreamRequest`) | Returns bounded errors (`Terminal not found`, `Terminal streaming not available`), stale stream tracking to suppress stale-input churn | Client can still loop if stale terminalId kept; no client-visible attach retry contract |

### Thread create/delete and selection
| Area | Files/Modules | What exists now | Gap vs Phase 06 |
|------|---------------|-----------------|-----------------|
| Create request tracking | `packages/web/src/thread/thread-store.ts` (`sendRequest`, `createThread`) | `onSendFailure`, 120s timeout, pending reset on timeout, form values remain in dialog component state | Error payload is flat string (no summary/details/copy); no dialog detail expansion model |
| Create dialog UI | `packages/web/src/components/thread-create-dialog.tsx` | Inline error + pending state | No expandable details/copy action; no bootstrap error struct |
| Delete active thread UX | `packages/web/src/thread/thread-store.ts` (`requestDeleteThread`, `handleThreadDeleteResponse`) | Optimistic `activeThreadKey=null` while pending; rollback on error | On success it auto-selects fallback thread immediately; requirement wants immediate `No active thread` |
| Sidebar actions | `packages/web/src/components/app-sidebar.tsx` | Create/switch/delete always enabled | Needs warm-up gating and tooltip reason while restart recovery incomplete |

### Restart flow and daemon churn
| Area | Files/Modules | What exists now | Gap vs Phase 06 |
|------|---------------|-----------------|-----------------|
| Server identity emission | `packages/server/src/server/websocket-server.ts` (`sendServerInfo`) | Sends `status: server_info` with stable `serverId` on connect/reconnect | Web client currently ignores this signal |
| Session reconnect continuity | `packages/server/src/server/websocket-server.ts` | Reuses session by `clientSessionKey` within grace window; avoids unnecessary cleanup | UI still needs explicit post-restart warm-up semantics |
| Daemon restart locking | `packages/server/src/server/pid-lock.ts`, `packages/server/scripts/supervisor.ts`, `packages/server/src/server/bootstrap.ts` | PID lock ownership checks and supervisor restart IPC path exist | Need verification for lock-churn absence during docker restart loops |

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | `19.2.0` | UI composition + effect lifecycle | Existing app architecture; all runtime state transitions already centered here |
| Jotai | `2.12.5` | Global client state for thread/diff/runtime flags | Existing store pattern with low ceremony and imperative update support |
| Browser WebSocket API | Baseline (MDN) | Native transport in browser client | Required for web runtime; direct control of close/open/error + readyState |
| `ws` (server) | `^8.14.2` in server package | Daemon WebSocket server | Existing production transport; includes heartbeat pattern used in server |
| xterm.js (`@xterm/xterm`) | `^6.0.0` | Terminal rendering/input | Existing terminal foundation with callback-based flow control hooks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix AlertDialog/Dialog/Tooltip | `^1.x` | Confirm/error/warm-up blocked action UX | Delete/create failure/warm-up reasons |
| Sonner | `^2.0.7` | Toast notifications | `Reconnected` success signal after recovery |
| Server `thread-registry` + `thread-lifecycle` | in-repo | Persistent active thread + create/delete/switch contract | Restart restoration, missing-thread fallback decisions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rewriting state with React Query/Zustand | Keep Jotai stores and extend | Lower risk; consistent with current codepaths and pending request map |
| New reconnect library wrapper | Keep native WS + existing `lib/ws.ts` | Current transport already functional; issue is state policy, not transport capability |
| Replacing terminal protocol | Keep binary-mux + streamId/ack model | Existing server/client protocol already handles stale stream IDs correctly |

**Installation:**
```bash
# No new runtime dependency is required for Phase 06.
```

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
├── lib/ws.ts                      # transport connect/reconnect + diagnostics
├── thread/thread-store.ts         # request lifecycle + active thread selection
├── terminal/terminal-stream.ts    # terminal input queue/flush semantics
├── components/
│   ├── ConnectionOverlay.tsx      # reconnect/attach visible state
│   ├── thread-create-dialog.tsx   # dialog-scoped create errors/details
│   └── app-sidebar.tsx            # create/switch/delete warm-up gating
└── App.tsx                        # attach retry state machine + toast hooks

packages/server/src/server/
├── websocket-server.ts            # server_info emission + reconnect continuity
├── session.ts                     # attach/input/ensure/thread handlers
└── thread/
    ├── thread-lifecycle.ts        # create/delete/switch operations
    └── thread-registry.ts         # active pointer persistence/fallback
```

### Pattern 1: Correlated Request + Cycle Guards (keep and extend)
**What:** Keep requestId and cycleId matching for every attach/create/delete response; ignore stale responses.
**When to use:** Any reconnect, active-thread switch, attach retry, create timeout path.
**Example:**
```typescript
// Source: packages/web/src/App.tsx
if (!pendingAttach || pendingAttach.requestId !== msg.payload?.requestId || pendingAttach.cycleId !== attachCycleRef.current) {
  return
}
```

### Pattern 2: Bounded Recovery Window State Machine
**What:** Introduce explicit phases for attach recovery: `idle -> retrying -> recovered|failed`, with `deadlineAt` (60s).
**When to use:** Reconnect succeeds but attach fails (`Terminal not found` or missing stream).
**Example:**
```typescript
// Source pattern: extend packages/web/src/App.tsx
type AttachRecoveryState = {
  phase: 'idle' | 'retrying' | 'failed'
  startedAt: number | null
  deadlineAt: number | null
  attempt: number
  lastError: string | null
}
```

### Pattern 3: Queue-Then-Flush Terminal Input (bounded)
**What:** Keep input enabled during retry by queueing keystrokes while stream/transport unavailable, then flush on attach success.
**When to use:** `status !== connected` or `streamId === null` during active-thread recovery.
**Example:**
```typescript
// Source guidance: packages/web/src/terminal/terminal-stream.ts + xterm flow-control guide
if (!this.inputEnabled || !this.transportConnected || this.streamId === null) {
  this.enqueueInput(text) // bounded bytes/chunks + TTL
  return
}
this.sendNow(text)
```

### Pattern 4: Restart-Aware Warm-Up Gate
**What:** Consume `status.server_info.serverId`; when serverId changes, mark warm-up until project+thread refresh and initial attach settle.
**When to use:** Docker/daemon restart and reconnect churn.
**Example:**
```typescript
// Source: server emits status/server_info in websocket-server.ts
if (nextServerId !== previousServerId) {
  runtimeRecovery.warmup = { active: true, reason: 'Daemon restarted' }
}
```

### Anti-Patterns to Avoid
- **Infinite attach retry loop:** Retrying attach forever on `Terminal not found` without deadline or backoff.
- **Global error leakage from create dialog:** Surfacing create-failure details as global toast instead of dialog-scoped actionable error.
- **Automatic fallback selection after deleting active thread:** Violates required immediate `No active thread` terminal state.
- **Unbounded queued input:** Queueing terminal input without max bytes/chunks/TTL can recreate lock-churn via replay bursts.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Broken WS detection | Custom JSON heartbeat protocol over session channel | Existing ws ping/pong + browser close/error semantics | Already implemented server-side heartbeat and native close semantics are spec-defined |
| Terminal backpressure model | Ad-hoc arbitrary sleeps before writes | xterm callback/ack-driven flow control + existing binary ack window | Prevents UI freeze and stream overflow; already aligned with current mux protocol |
| Dialog accessibility/tooltip semantics | Custom modal/tooltip primitives | Existing Radix dialog/alert/tooltip components | Keeps accessibility and keyboard behavior consistent |
| Thread persistence | New sidecar persistence file | Existing `thread-registry.json` + `ThreadRegistry` APIs | Avoids split-brain active-thread state |

**Key insight:** Hardening should extend existing finite-state/request-correlation mechanisms, not add a second runtime control plane.

## Common Pitfalls

### Pitfall 1: Treating reconnect as equivalent to recovered attach
**What goes wrong:** WS reaches `connected` but terminal remains detached; UI looks healthy while input silently drops.
**Why it happens:** Transport status and terminal stream status are separate.
**How to avoid:** Track attach recovery state separately and require explicit attached-stream success before clearing errors.
**Warning signs:** `connected` badge with repeated attach errors and no `streamId`.

### Pitfall 2: Stale terminal ID loops after restart
**What goes wrong:** Client retries stale `terminalId` and receives repeated `Terminal not found`.
**Why it happens:** Active thread metadata survives reconnect but backing terminal session changed.
**How to avoid:** On attach failure, re-resolve thread list + terminal mapping and retry with bounded 60s window.
**Warning signs:** Repeating identical attach error with unchanged terminalId.

### Pitfall 3: Create-thread pending never clears during disruption
**What goes wrong:** Dialog remains `Creating...` after socket loss.
**Why it happens:** Pending state set before send; request never sent/never times out.
**How to avoid:** Keep `onSendFailure` immediate path plus strict timeout boundary reset.
**Warning signs:** `create.pending === true` while connection status is `disconnected` for long duration.

### Pitfall 4: Active-thread deletion races with stale attach retries
**What goes wrong:** UI shows no active thread then stale attach retries continue and repaint terminal unexpectedly.
**Why it happens:** Attach loop not canceled when `activeThreadKey` becomes `null`.
**How to avoid:** Increment attach cycle and cancel pending attach/retry timers immediately on active-thread null transition.
**Warning signs:** `No active thread` header with ongoing attach requests in logs.

### Pitfall 5: Restart warm-up actions not gated
**What goes wrong:** User creates/switches/deletes while registry and terminal state still hydrating.
**Why it happens:** No restart-aware warm-up flag in web UI.
**How to avoid:** Disable risky actions until warm-up done; show tooltip reason.
**Warning signs:** Immediate action errors right after daemon restart.

## Recommended Implementation Patterns for This Codebase

1. Add `runtimeRecovery` slice in `thread-store` (or sibling store) with: `daemonServerId`, `warmup`, `attachRecovery`, `lastReconnectAt`, `reconnectedToastPending`.
2. Parse `status` session messages in web (currently ignored) and consume `server_info` for restart detection.
3. Extend `TerminalStreamAdapter` with bounded input queue (`maxBytes`, `maxChunks`, `ttlMs`) and `flushQueuedInput()` on `confirmAttachedStream`.
4. In `App.tsx`, replace one-shot attach failure behavior with timer-driven bounded retry loop (deadline 60s, visible indicator), clear on success, emit `toast('Reconnected')` once per recovery.
5. In `thread-store`, preserve `activeThreadKey` on reconnect, but on restart warm-up completion fallback to newest thread if prior missing; keep `null` immediately after active delete success (do not auto-switch).
6. In sidebar/dialog components, gate create/switch/delete during warm-up with disabled state + tooltip reason.
7. Upgrade create-error shape from plain string to `{ summary, details?, requestId?, copyText }` while preserving dialog-scoped rendering.

## Code Examples

Verified patterns from official sources and repo:

### Native WebSocket readiness guard
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
// Source: packages/web/src/lib/ws.ts
if (socket?.readyState !== WebSocket.OPEN) {
  return false
}
socket.send(JSON.stringify(payload))
```

### ws heartbeat for broken connection detection
```typescript
// Source: https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
// Source: packages/server/src/server/websocket-server.ts
if (heartbeatClient.isAlive === false) {
  heartbeatClient.terminate()
  return
}
heartbeatClient.isAlive = false
heartbeatClient.ping()
```

### xterm callback-based flow control anchor
```typescript
// Source: https://xtermjs.org/docs/guides/flowcontrol/
// Source: packages/web/src/terminal/terminal-stream.ts
this.terminal.write(text, () => {
  this.sendAck(nextOffset)
})
```

### Existing immediate create send-failure path
```typescript
// Source: packages/web/src/thread/thread-store.ts
sendRequest(request, pending, {
  onSendFailure: () => setCreateError(CREATE_THREAD_DISCONNECTED_ERROR),
  onTimeout: () => setCreateError(CREATE_THREAD_TIMEOUT_ERROR),
})
```

## Verification Commands and Checks (RUN-01..RUN-04)

### RUN-01 restart/reconnect without daemon lock-churn loops
```bash
# 1) start stack
mise run docker:start

# 2) restart runtime while web stays open
docker compose restart oisin-ui

# 3) inspect daemon logs for lock churn and reconnect stability
docker compose logs --since=5m oisin-ui

# 4) verify no duplicate daemon lock failure during restart
docker compose logs --since=5m oisin-ui | rg "Another Paseo daemon is already running|Failed to acquire PID lock|EEXIST"
```
Checks:
- Web reconnects to `connected` state.
- No repeating PID lock errors during expected restart window.
- No repeated reconnect oscillation after stabilization.

### RUN-02 attach recovery without repeated `Terminal not found` loops
```bash
# daemon test coverage (session + reconnect behavior)
bun run --filter @getpaseo/server test -- src/server/daemon-e2e/thread-management.e2e.test.ts

# manual browser check with daemon restart/churn
docker compose restart oisin-ui
```
Checks:
- On reconnect attach failure, retry indicator visible; retries stop by 60s deadline.
- `Terminal not found` is bounded (no infinite repeated loop).
- Success clears error and shows `Reconnected` toast once.

### RUN-03 create-thread during transient websocket disruption is bounded/actionable
```bash
# web UI + runtime manual test
docker compose restart oisin-ui

# during reconnect, trigger Create Thread in UI
# then verify recovery/error behavior and timeout reset
```
Checks:
- If socket not open: immediate dialog error (no pending spinner lock).
- If bootstrap fails: summary shown with expandable details + copy action.
- Creating state resets exactly at timeout; form values preserved.

### RUN-04 deleting active thread lands immediately in `No active thread`
```bash
# server thread lifecycle regression
bun run --filter @getpaseo/server test -- src/server/daemon-e2e/thread-management.e2e.test.ts

# web manual regression
# delete currently active thread from sidebar dialog
```
Checks:
- Main panel switches immediately to `No active thread`.
- Deleted row removed immediately from sidebar.
- No stale attach retries after delete.
- On delete failure, previous active selection restored.

## Planning-Ready Breakdown (Small Executable Slices)

1. **Slice A (RUN-03 first, low coupling):** Harden create-thread pending/error contract (immediate send-failure, timeout reset assertion, structured dialog error object).
2. **Slice B (RUN-04):** Enforce delete-active immediate null selection semantics + cancel all attach retry timers on null active thread.
3. **Slice C (RUN-02 core):** Add bounded attach-retry state machine (60s window, visible indicator, success-clear + toast).
4. **Slice D (RUN-02 queued input):** Implement bounded terminal input queue in `TerminalStreamAdapter`, flush on attach success, drop with explicit reason when limits exceeded.
5. **Slice E (RUN-01 + restart UX):** Consume `server_info.serverId`, detect daemon restart, add warm-up chip and risky-action gating with tooltip, preserve prior selection and fallback to newest when missing.
6. **Slice F (verification closure):** Add deterministic regression checks for each RUN path (server vitest/e2e + browser manual script/evidence updates).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket-only reconnect status as recovery proxy | Separate transport status and attach recovery status | Needed for Phase 06 | Prevents false "connected" success while terminal detached |
| Unbuffered terminal input during disconnect | Bounded queued input with explicit flush/drop policy | Needed for RUN-02 decisions | Preserves user intent during short reconnect windows |
| Auto-fallback selection after active delete | Immediate `No active thread`, restore only on delete failure | Needed for RUN-04 decision | Removes stale attach churn and surprising context jumps |

**Deprecated/outdated:**
- Assuming reconnect success implies attach success; this is not valid in current architecture.

## Open Questions

1. **Where to store restart/warm-up state (`thread-store` vs dedicated runtime store)?**
   - What we know: Existing code already centralizes cross-component state in Jotai stores.
   - What's unclear: Whether to colocate with thread-store or isolate to reduce coupling.
   - Recommendation: Start in `thread-store` for phase speed; split later only if complexity grows.

2. **Definition of "newest available" fallback when prior thread missing after restart (global vs per-project)?**
   - What we know: Current code uses first available by current ordering, not explicit "newest" policy.
   - What's unclear: whether newest is global across projects or scoped to prior project.
   - Recommendation: Use global newest by `updatedAt` unless product later constrains by project.

## Sources

### Primary (HIGH confidence)
- `packages/web/src/lib/ws.ts` - reconnect/backoff/send semantics
- `packages/web/src/App.tsx` - attach lifecycle, cycle guards, overlay wiring
- `packages/web/src/terminal/terminal-stream.ts` - input/ack behavior and no-op pending buffer
- `packages/web/src/thread/thread-store.ts` - create/delete/switch request lifecycle and fallback behavior
- `packages/web/src/components/thread-create-dialog.tsx` - current create error UX
- `packages/web/src/components/thread-delete-dialog.tsx` - delete flow UX
- `packages/web/src/components/app-sidebar.tsx` - action controls to gate during warm-up
- `packages/server/src/server/session.ts` - thread handlers + attach/input + ensure default terminal
- `packages/server/src/server/websocket-server.ts` - reconnect continuity + server_info status
- `packages/server/src/server/thread/thread-lifecycle.ts` - create/delete/switch service
- `packages/server/src/server/thread/thread-registry.ts` - active-thread persistence/fallback logic
- `packages/server/src/server/pid-lock.ts` - daemon lock behavior
- https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
- https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
- https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
- https://xtermjs.org/docs/guides/flowcontrol/

### Secondary (MEDIUM confidence)
- https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ (retry/backoff/jitter operational guidance)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on in-repo package versions + official docs for WebSocket/ws/xterm behavior
- Architecture: HIGH - based on concrete existing code paths and locked Phase 06 decisions
- Pitfalls: HIGH - observed directly in current state transitions and response handling

**Research date:** 2026-02-25
**Valid until:** 2026-03-27 (30 days; medium-moving runtime UX domain)
