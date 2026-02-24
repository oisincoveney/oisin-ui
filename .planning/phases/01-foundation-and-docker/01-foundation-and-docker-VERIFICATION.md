---
phase: 01-foundation-and-docker
verified: 2026-02-24T03:12:00Z
status: gaps_found
score: 5/5 must-haves verified (runtime gate failed)
re_verification:
  previous_status: human_needed
  previous_verified: 2026-02-21T23:13:11Z
  runtime_capture_phase: 05-docker-runtime-verification-closure
  runtime_app_url: http://localhost:44285/
  runtime_daemon_endpoint: localhost:6767
  outcomes:
    single_container_tmux_process: passed
    websocket_101_upgrade: failed
    controlled_stop_no_orphans: failed
  evidence:
    - .planning/phases/05-docker-runtime-verification-closure/evidence/process-tree.txt
    - .planning/phases/05-docker-runtime-verification-closure/evidence/ws-handshake.md
    - .planning/phases/05-docker-runtime-verification-closure/evidence/post-stop-process-check.txt
---

# Phase 1: Foundation & Docker Verification Report

**Phase Goal:** A running daemon serves a web client inside Docker, and they can talk to each other.
**Verified:** 2026-02-24T03:12:00Z
**Status:** gaps_found
**Re-verification:** Yes - runtime evidence review from phase 05

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                     | Status     | Evidence                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application can run in a single Docker container with daemon + web UI                     | ✓ VERIFIED | `Dockerfile` defines one image and startup (`ENTRYPOINT` + `CMD`) and `docker-compose.yml` defines one `oisin-ui` service with ports `3000`/`5173`.                                          |
| 2   | Container startup script launches daemon and web together and handles termination signals | ✓ VERIFIED | `scripts/start.sh` launches both processes, sets `trap` for `SIGTERM`/`SIGINT`, and shuts down both PIDs on exit.                                                                            |
| 3   | Daemon exposes WebSocket endpoint and heartbeat lifecycle                                 | ✓ VERIFIED | `packages/server/src/server/websocket-server.ts` mounts `/ws`, pings every interval, marks `isAlive`, handles `pong`, and terminates stale clients.                                          |
| 4   | Web client has connection status UI wired to live connection state                        | ✓ VERIFIED | `packages/web/src/App.tsx` uses `useConnectionStatus()` and renders status indicator plus `ConnectionOverlay`.                                                                               |
| 5   | Web client connects to daemon WebSocket endpoint and supports reconnect behavior          | ✓ VERIFIED | `packages/web/src/lib/ws.ts` creates `new WebSocket('ws://localhost:3000/ws?clientSessionKey=web-client')`, tracks `connecting/connected/disconnected`, and schedules exponential reconnect. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                            | Expected                                        | Status     | Details                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Dockerfile`                                        | Single-container runtime with signal-safe PID 1 | ✓ VERIFIED | Exists (28 lines), substantive, includes `tini`, exposes `3000`/`5173`, and runs `scripts/start.sh`.                     |
| `docker-compose.yml`                                | One service wiring ports/volumes                | ✓ VERIFIED | Exists (17 lines), substantive, one `oisin-ui` service with required mappings and config volume.                         |
| `scripts/start.sh`                                  | Multi-process bootstrap + graceful shutdown     | ✓ VERIFIED | Exists (43 lines), substantive shell supervisor logic (`trap`, PID tracking, `wait -n`, coordinated teardown).           |
| `packages/server/src/server/websocket-server.ts`    | WS server + heartbeat ping/pong                 | ✓ VERIFIED | Exists (1107 lines), substantive implementation with `/ws` endpoint and heartbeat termination path.                      |
| `packages/server/src/server/bootstrap.ts`           | Daemon wiring of HTTP + WS server               | ✓ VERIFIED | Exists (633 lines), creates HTTP server, instantiates `VoiceAssistantWebSocketServer`, and listens on configured target. |
| `packages/web/src/lib/ws.ts`                        | Client WS transport + state/reconnect           | ✓ VERIFIED | Exists (245 lines), substantive hook and connection manager with backoff and message handling.                           |
| `packages/web/src/components/ConnectionOverlay.tsx` | Connecting/disconnected overlays                | ✓ VERIFIED | Exists (31 lines), substantive conditional UI for connecting and reconnecting states.                                    |
| `packages/web/src/App.tsx`                          | Status indicator + overlay integration          | ✓ VERIFIED | Exists (39 lines), imports overlay + hook and renders connected/disconnected indicator.                                  |
| `package.json`                                      | Workspace wiring includes server/cli/web        | ✓ VERIFIED | Exists (61 lines), workspaces include `packages/server`, `packages/cli`, `packages/web`.                                 |

### Key Link Verification

| From                                      | To                                               | Via                                                               | Status  | Details                                                         |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| `Dockerfile`                              | `scripts/start.sh`                               | `CMD ["bash", "./scripts/start.sh"]`                              | ✓ WIRED | Startup script is executable and set as container command.      |
| `scripts/start.sh`                        | Daemon + web processes                           | `npm run dev:server` and `npm run dev --workspace=@oisin/web`     | ✓ WIRED | Both processes are launched and lifecycle-managed together.     |
| `packages/server/src/server/bootstrap.ts` | `packages/server/src/server/websocket-server.ts` | `new VoiceAssistantWebSocketServer(...)`                          | ✓ WIRED | WS layer is attached to the HTTP server used by daemon startup. |
| `packages/web/src/lib/ws.ts`              | Daemon WS endpoint                               | `new WebSocket('ws://localhost:3000/ws?...')`                     | ✓ WIRED | Client points at daemon WS route with session key.              |
| `packages/web/src/App.tsx`                | Connection state + overlay UI                    | `useConnectionStatus()` + `<ConnectionOverlay status={status} />` | ✓ WIRED | Transport state is rendered directly in user-visible UI.        |

### Requirements Coverage

| Requirement                                                                     | Status        | Blocking Issue                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| DOCK-01: Application runs in a single Docker container (daemon + web UI + tmux) | ✗ NOT SATISFIED | Runtime verification failed: no WS `101 Switching Protocols` (`ws-handshake.md`) and controlled stop reported `orphans-found` (`post-stop-process-check.txt`). |

### Runtime Evidence (Phase 05)

| Runtime check | Expected | Result | Evidence |
| --- | --- | --- | --- |
| Single-container process tree includes daemon, web, and tmux | One `oisin-ui` runtime with `tini` -> `start.sh` -> daemon + Vite + tmux | ✓ PASSED | `.planning/phases/05-docker-runtime-verification-closure/evidence/process-tree.txt` |
| Browser-to-daemon websocket upgrade reaches HTTP 101 | `ws://localhost:6767/ws?clientSessionKey=web-client` upgrades to `101 Switching Protocols` from app served at `http://localhost:44285/` | ✗ FAILED | `.planning/phases/05-docker-runtime-verification-closure/evidence/ws-handshake.md` (`ERR_CONNECTION_REFUSED`, close `1006`, `HTTP 101 seen: no`) |
| Controlled stop leaves no orphan processes | Post-stop host check returns `no-orphan-processes-detected` | ✗ FAILED | `.planning/phases/05-docker-runtime-verification-closure/evidence/post-stop-process-check.txt` (`orphans-found`) |

### Anti-Patterns Found

| File                                                | Line | Pattern                          | Severity | Impact                                                        |
| --------------------------------------------------- | ---- | -------------------------------- | -------- | ------------------------------------------------------------- |
| `packages/web/src/components/ConnectionOverlay.tsx` | 10   | `return null` in connected state | ℹ️ Info  | Intentional conditional render; not a stub/placeholder issue. |

### Runtime Verification Follow-up Required

1. Restore daemon reachability from Docker-served web runtime so websocket handshake succeeds with HTTP 101 at `ws://localhost:6767/ws?clientSessionKey=web-client`.
2. Re-run controlled stop and require `.planning/phases/05-docker-runtime-verification-closure/evidence/post-stop-process-check.txt` to contain `no-orphan-processes-detected`.
3. Re-run phase 05 closure plan only after both runtime conditions pass.

### Gaps Summary

Structural phase-1 artifacts remain complete, but DOCK-01 stays open due to failed runtime evidence in phase 05. The gate is now a concrete runtime failure, not an unexecuted manual check.

---

_Verified: 2026-02-24T03:12:00Z_
_Verifier: OpenCode (gsd-verifier)_
