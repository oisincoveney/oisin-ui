---
phase: 01-foundation-and-docker
verified: 2026-02-25T03:10:25Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "User opens web UI and sees a connected status indicator"
  gaps_remaining: []
  regressions: []
---

# Phase 1: Foundation & Docker Verification Report

**Phase Goal:** A running daemon serves a web client inside Docker, and they can talk to each other.
**Verified:** 2026-02-25T03:10:25Z
**Status:** passed
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can run a single Docker service containing daemon + web runtime | ✓ VERIFIED | `Dockerfile:27` uses `tini` PID 1 and `Dockerfile:28` launches `scripts/start.sh`; `docker-compose.yml:2` defines single `oisin-ui` service with daemon/web ports (`docker-compose.yml:7-8`). |
| 2 | Container startup launches daemon + web together and handles shutdown signals | ✓ VERIFIED | `scripts/start.sh:26` starts daemon, `scripts/start.sh:29` starts web, `scripts/start.sh:41` traps `SIGTERM`/`SIGINT`/`EXIT`, and `scripts/start.sh:43-53` exits when one child stops and cleans both. |
| 3 | Daemon exposes websocket endpoint with heartbeat lifecycle | ✓ VERIFIED | `packages/server/src/server/websocket-server.ts:286` mounts `/ws`; heartbeat ping/pong + stale terminate at `packages/server/src/server/websocket-server.ts:321-337` and `packages/server/src/server/websocket-server.ts:363-366`. |
| 4 | Web client connects to daemon websocket using runtime host/port and reconnects | ✓ VERIFIED | `packages/web/src/lib/ws.ts:53-58` builds URL from `window.location.hostname` + runtime daemon port; `packages/web/src/lib/ws.ts:342` opens `WebSocket`; reconnect backoff at `packages/web/src/lib/ws.ts:151-177`. |
| 5 | User opens web UI and sees a connected status indicator | ✓ VERIFIED | `packages/web/src/App.tsx:66-71` defines connected badge state and `packages/web/src/App.tsx:522-529` renders connected/connecting/reconnecting/disconnected badge in header. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `Dockerfile` | Single-container runtime with signal-safe PID 1 | ✓ VERIFIED | Exists (28 lines), substantive, includes `tini`, exposes daemon+web ports, wired to startup script. |
| `docker-compose.yml` | One service wiring ports/volumes | ✓ VERIFIED | Exists (19 lines), substantive, one `oisin-ui` service with expected port mappings. |
| `scripts/start.sh` | Multi-process bootstrap + graceful shutdown | ✓ VERIFIED | Exists (53 lines), substantive trap/cleanup supervisor for both child processes. |
| `packages/server/src/server/websocket-server.ts` | WS server + heartbeat ping/pong | ✓ VERIFIED | Exists (1107 lines), substantive `/ws` server + heartbeat lifecycle and stale-client termination. |
| `packages/server/src/server/bootstrap.ts` | Daemon wiring of HTTP + WS server | ✓ VERIFIED | Exists (661 lines), creates HTTP server and instantiates `VoiceAssistantWebSocketServer` (`packages/server/src/server/bootstrap.ts:488-522`). |
| `packages/web/src/lib/ws.ts` | Client websocket transport + reconnect | ✓ VERIFIED | Exists (504 lines), substantive runtime endpoint resolution + reconnect scheduling + diagnostics. |
| `packages/web/src/components/ConnectionOverlay.tsx` | Connecting/disconnected overlays | ✓ VERIFIED | Exists (59 lines), substantive non-connected overlays; connected state intentionally returns `null`. |
| `packages/web/src/App.tsx` | Connection state rendered to user including connected indicator | ✓ VERIFIED | Exists (630 lines), status hook wired and visible connection badge rendered in app header. |
| `package.json` | Workspace wiring includes server/cli/web | ✓ VERIFIED | Exists (67 lines), workspaces include `packages/server`, `packages/cli`, `packages/web`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `Dockerfile` | `scripts/start.sh` | `CMD ["bash", "./scripts/start.sh"]` | ✓ WIRED | Container runtime entrypoint/command chain correctly resolves to startup supervisor. |
| `scripts/start.sh` | Daemon + web processes | `bun run dev:server` + `bun run --filter @oisin/web dev` | ✓ WIRED | Both processes launched and managed under one trap-driven lifecycle. |
| `packages/server/src/server/bootstrap.ts` | `packages/server/src/server/websocket-server.ts` | `new VoiceAssistantWebSocketServer(httpServer, ...)` | ✓ WIRED | WS server attached to daemon HTTP server (`packages/server/src/server/bootstrap.ts:488-522`). |
| `packages/web/src/lib/ws.ts` | Daemon WS endpoint | `resolveWsTarget()` + `new WebSocket(target.wsUrl)` | ✓ WIRED | Browser hostname + daemon port endpoint is resolved and used for socket connect. |
| `packages/web/src/App.tsx` | User-visible connection state | `useConnectionStatus()` + rendered badge + `<ConnectionOverlay />` | ✓ WIRED | Positive connected state now has explicit visible badge in header. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| DOCK-01: Application runs in a single Docker container (daemon + web UI + tmux) | ✓ SATISFIED | Fresh phase-05 runtime artifacts confirm deterministic gate pass with daemon-ready startup (`compose-up-attached.txt`), browser-origin WS 101 (`ws-handshake.md`), and clean stop (`post-stop-process-check.txt`) with no duplicate-daemon lock churn. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/web/src/components/ConnectionOverlay.tsx` | 17 | `return null` | ℹ️ Info | Intentional for connected state because connected badge is rendered in `packages/web/src/App.tsx`. |
| `packages/server/src/server/config.ts` | 24 | `return null` | ℹ️ Info | Expected in `parsePortValue` invalid-input branch; not a stub. |

### Gaps Summary

Previous blocking gap is closed. Connected-state UI is now explicitly rendered, and no regressions were detected in previously verified Docker/bootstrap/websocket wiring.

---

_Verified: 2026-02-25T03:10:25Z_
_Verifier: OpenCode (gsd-verifier)_
