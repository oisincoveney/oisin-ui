# Phase 05: Docker Runtime Verification Closure - Research

**Researched:** 2026-02-23
**Domain:** Docker runtime verification and audit evidence closure for single-container daemon + web + tmux
**Confidence:** HIGH

## Summary

This phase is an operational closure phase, not a redesign phase. The code path for single-container runtime already exists (`Dockerfile`, `docker-compose.yml`, `scripts/start.sh`, WebSocket wiring in server/web); the remaining work is to execute a deterministic verification runbook and capture audit-grade evidence that the runtime gate is truly closed.

The standard approach is: run `docker compose up --build` in attached mode, verify one service/container is up, verify browser-to-daemon WebSocket upgrade succeeds (HTTP 101) from the Docker-served URL, then perform a controlled shutdown (SIGINT/Ctrl+C) and prove no lingering project containers/processes remain.

Use Docker-native observability (`docker compose ps`, `docker compose logs`, `docker top`) plus browser network evidence (WS 101 + open frames). Avoid adding new test harnesses; this should be closed with reproducible commands, saved outputs, and an updated verification status.

**Primary recommendation:** Close DOCK-01 by running an evidence-first runtime checklist in attached compose mode and storing command output + browser handshake proof in phase-05 artifacts.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Docker Engine + Compose CLI | current local install | Build/start/stop single container runtime | Official mechanism for `up`, stop-on-SIGINT behavior, and service state inspection |
| `tini` (`/usr/bin/tini`) | distro package in image | PID 1 init, signal forwarding, zombie reaping | Container init best practice; avoids orphan/zombie process behavior |
| Browser DevTools (Network WS) | browser built-in | Verify WebSocket handshake (`101 Switching Protocols`) | Canonical way to prove browser<->daemon WS upgrade happened |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `docker compose ps --format json` | Compose CLI | Machine-readable container state evidence | Every verification run; include before/after shutdown snapshots |
| `docker compose logs` | Compose CLI | Runtime event evidence (daemon/web startup, shutdown) | Capture startup + controlled-stop timeline |
| `docker top` / `ps` in container | Docker CLI / proc tools | Process-tree inspection (daemon + web under supervisor) | During runtime and immediately before shutdown checks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual visual-only checks | Playwright/browser automation for WS checks | Automation is nice, but this gate is already marked human-needed; fastest closure is manual + explicit artifacts |
| Custom shell health checker scripts | Existing Docker CLI commands | Custom scripts add maintenance burden and can drift from Docker semantics |
| Detached `docker compose up -d` only | Attached `docker compose up --build` | Detached mode cannot directly validate Ctrl+C controlled-stop behavior |

**Installation:**
```bash
# No new dependencies required for phase 05.
```

## Architecture Patterns

### Recommended Project Structure
```
.planning/phases/05-docker-runtime-verification-closure/
├── 05-RESEARCH.md                # This document
├── 05-VERIFICATION.md            # Verification outcome update
└── evidence/                     # Raw proof captured during runtime checks
    ├── compose-ps-start.json
    ├── compose-logs-start.txt
    ├── ws-handshake.md
    ├── process-tree.txt
    └── compose-ps-stop.json
```

### Pattern 1: Attached Compose Runtime Verification
**What:** Run compose in attached mode so startup and controlled stop are observed in one timeline.
**When to use:** Always for DOCK-01 closure.
**Example:**
```bash
# Source: https://docs.docker.com/reference/cli/docker/compose/up/
docker compose up --build

# In another terminal while running:
docker compose ps --format json
docker compose logs --no-color --timestamps
docker top "$(docker compose ps -q oisin-ui)"
```

### Pattern 2: Browser WS Handshake Evidence (Network-Layer)
**What:** Validate WS upgrade at HTTP/network layer, not only UI appearance.
**When to use:** Every time Success Criterion #2 is evaluated.
**Example:**
```text
Open http://localhost:44285
DevTools -> Network -> WS -> select /ws?clientSessionKey=web-client
Assert:
- request URL is ws://localhost:6767/ws?clientSessionKey=web-client
- status is 101 Switching Protocols
- frames show ping/pong or session traffic
```

### Pattern 3: Controlled Stop + Post-Stop Absence Proof
**What:** Stop with Ctrl+C (SIGINT), then prove the project has no running containers.
**When to use:** Every runtime verification pass.
**Example:**
```bash
# Source: https://docs.docker.com/reference/cli/docker/compose/up/
# Ctrl+C in attached docker compose up terminal

docker compose ps --all --format json
docker compose down --remove-orphans
docker compose ps --all --format json
```

### Anti-Patterns to Avoid
- **Detached-only verification:** `up -d` cannot prove interactive controlled stop behavior.
- **UI-only handshake validation:** Visual state can pass while WS target/port is wrong; require WS 101 evidence.
- **Skipping post-stop checks:** Container exit alone is insufficient; always capture post-stop `compose ps` output.
- **Port drift from legacy docs:** Prior phase docs mention old ports; current runtime is web `44285`, daemon `6767`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service readiness proof | Custom polling script | `docker compose ps --format json` + logs | Compose already exposes authoritative state |
| PID1/signal management | Custom init wrapper | `tini` ENTRYPOINT + existing `start.sh` trap | Reaping + signal forwarding edge cases are non-trivial |
| WS upgrade validation | Ad-hoc endpoint ping hacks | Browser Network WS inspector (`101`) + app diagnostics | Upgrade correctness is protocol-level, not plain HTTP health |
| Orphan detection | Host-wide process grep heuristics | Compose project-scoped `ps/down --remove-orphans` and container process snapshots | Avoid false positives and project scope bleed |

**Key insight:** This gate closes by proving runtime behavior with Docker/browser-native tools, not by adding new runtime control code.

## Common Pitfalls

### Pitfall 1: Verifying Against Stale Ports
**What goes wrong:** Checks use `5173`/`3000` from older docs and report false failures.
**Why it happens:** Legacy Phase 1 verification references pre-alignment ports.
**How to avoid:** Use current wiring: web `44285` (`docker-compose.yml`), daemon `6767` (`PASEO_LISTEN`, `VITE_DAEMON_PORT`).
**Warning signs:** Browser opens old port, WS points to wrong endpoint, connection overlay remains.

### Pitfall 2: Mistaking Build Success for Runtime Success
**What goes wrong:** `docker compose build` passes, but runtime gate remains open.
**Why it happens:** DOCK-01 closure requires startup + handshake + controlled stop, not just image build.
**How to avoid:** Always run full attached `docker compose up --build` flow and capture all three success criteria.
**Warning signs:** No browser/network evidence, no shutdown evidence.

### Pitfall 3: Orphan Check Too Weak
**What goes wrong:** Team assumes Ctrl+C means clean stop without verification.
**Why it happens:** Signal handling across PID1 + child processes can fail silently in misconfigured containers.
**How to avoid:** Capture process tree during run, then post-stop `compose ps --all` and `down --remove-orphans` result.
**Warning signs:** Container stuck in `restarting`/`running`, repeated stale service entries.

### Pitfall 4: Environment Flakes Polluting Phase Scope
**What goes wrong:** Bun/Vitest EPIPE or repo-wide typecheck OOM blocks closure work.
**Why it happens:** Known shell constraints from `STATE.md` are unrelated to this operational gate.
**How to avoid:** Scope phase checks to Docker runtime verification commands only.
**Warning signs:** Attempting full monorepo test/typecheck during DOCK-01 closure.

## Code Examples

Verified patterns from official sources and this repo wiring:

### Runtime Bring-Up and State Capture
```bash
# Source: https://docs.docker.com/reference/cli/docker/compose/up/
docker compose up --build

# Source: https://docs.docker.com/reference/cli/docker/compose/ps/
docker compose ps --format json > .planning/phases/05-docker-runtime-verification-closure/evidence/compose-ps-start.json

# Source: https://docs.docker.com/reference/cli/docker/compose/logs/
docker compose logs --no-color --timestamps > .planning/phases/05-docker-runtime-verification-closure/evidence/compose-logs-start.txt
```

### WS Handshake Acceptance Criteria
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/101
// Source: packages/web/src/lib/ws.ts
// Expected client target format:
// ws://<browser-host>:6767/ws?clientSessionKey=web-client
// Verification requires HTTP 101 Switching Protocols in browser network panel.
```

### Controlled Stop and Cleanup Proof
```bash
# Ctrl+C in attached compose terminal (SIGINT)
# Source: https://docs.docker.com/reference/cli/docker/compose/up/

docker compose ps --all --format json > .planning/phases/05-docker-runtime-verification-closure/evidence/compose-ps-stop.json

# Source: https://docs.docker.com/reference/cli/docker/compose/down/
docker compose down --remove-orphans
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static code-only phase verification for Docker gate | Runtime evidence closure with explicit command + browser proofs | Milestone audit 2026-02-23 | Converts DOCK-01 from `partial/human_needed` to auditable pass/fail |
| Legacy fixed localhost WS assumptions in client | Host-derived WS target + env-driven daemon port (`VITE_DAEMON_PORT`) | Phase 01-06 | Enables Docker/LAN-friendly runtime verification against real served URL |

**Deprecated/outdated:**
- Legacy Phase 1 runtime expectations on ports `3000/5173`: replaced by `6767/44285` in current repo wiring.

## Open Questions

1. **Should closure evidence include reconnect interruption test or only the three listed criteria?**
   - What we know: Milestone gap explicitly requires startup, handshake, controlled stop.
   - What's unclear: Whether reconnect overlay check (older Phase 1 human checklist) is still required for audit signoff.
   - Recommendation: Treat reconnect as optional non-blocking evidence unless milestone auditor requires it explicitly.

2. **Should verification run in attached mode only, or include detached smoke too?**
   - What we know: Attached mode is required to prove Ctrl+C stop semantics.
   - What's unclear: Whether team wants detached follow-up for operator ergonomics.
   - Recommendation: Make attached mode mandatory; detached smoke optional add-on.

## Sources

### Primary (HIGH confidence)
- https://docs.docker.com/reference/cli/docker/compose/up/ - startup behavior, attached-mode stop semantics, `--build`
- https://docs.docker.com/reference/cli/docker/compose/ps/ - service state inspection and JSON output
- https://docs.docker.com/reference/cli/docker/compose/logs/ - runtime log collection
- https://docs.docker.com/reference/cli/docker/compose/down/ - project cleanup and orphan removal
- https://docs.docker.com/reference/cli/docker/container/stop/ - SIGTERM then SIGKILL timeout behavior
- https://github.com/krallin/tini - PID1 responsibilities: signal forwarding + zombie reaping
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/101 - WS upgrade success criterion
- `docker-compose.yml` - single `oisin-ui` service, web port mapping `44285`
- `Dockerfile` - `tini` entrypoint and runtime env defaults
- `scripts/start.sh` - dual-process startup and trap-based coordinated cleanup
- `packages/server/src/server/config.ts` - daemon listen/env resolution
- `packages/web/src/lib/ws.ts` - browser WS target construction and reconnect lifecycle

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on official Docker docs + concrete repo runtime files
- Architecture: HIGH - derived from existing runtime wiring and required audit criteria
- Pitfalls: HIGH - directly grounded in current repo state and known blockers in `STATE.md`

**Research date:** 2026-02-23
**Valid until:** 2026-03-25 (30 days; stable operational/tooling domain)
