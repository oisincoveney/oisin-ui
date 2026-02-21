---
phase: 01-foundation-and-docker
plan: 04
subsystem: infra
tags: [docker, node22, tini, bun, tmux, compose]
requires:
  - phase: 01-foundation-and-docker
    plan: 02
    provides: "Docker-ready daemon startup and websocket heartbeat behavior"
  - phase: 01-foundation-and-docker
    plan: 03
    provides: "`packages/web` workspace and scripts available for in-container execution"
provides:
  - "Single-container environment to run daemon and web app together"
  - "PID-1 signal handling via `tini` and graceful multi-process teardown"
  - "Local mount workflow for `/workspace`, `/config`, and SSH access"
affects:
  - 01-05
tech-stack:
  added:
    - node:22-bookworm
    - tini
    - bun
    - docker-compose
  patterns:
    - Use `tini` as PID 1 with shell bootstrap process management
    - Run daemon and web concurrently in one script with trap-based cleanup
key-files:
  created:
    - Dockerfile
    - docker-compose.yml
    - scripts/start.sh
  modified: []
---

# Phase 01 Plan 04: Docker Configuration

**Established a single-container runtime for daemon and web using `node:22-bookworm`, required tooling, and a signal-safe bootstrap script so both processes are started and shut down together**

## Performance

- **Duration:** 00:02:14
- **Started:** 2026-02-21T22:52:01Z
- **Completed:** 2026-02-21T22:54:15Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added a `Dockerfile` with required OS-level tools, global `bun` install, PID 1 entrypoint, and daemon/web port exposure.
- Added `docker-compose.yml` with one `oisin-ui` service, bind + named volume mounts, read-only SSH mount, and required host-port mappings.
- Added `scripts/start.sh` to run daemon and web in parallel with signal traps and fail-fast shutdown, then wired it as container startup command.

## Task Commits

1. **Task 1: Create Dockerfile** - `c713462` (`feat`)
2. **Task 2: Setup Docker Compose** - `5a1a26c` (`feat`)
3. **Task 3: Create Start Script** - `2c2e3ed` (`feat`)

## Files Created/Modified

- `Dockerfile` - single-container image with Debian-based Node toolchain and `bun` install.
- `docker-compose.yml` - single service with required mounts and exposed ports.
- `scripts/start.sh` - process supervisor for daemon + web startup and shutdown lifecycle.

## Decisions Made

- Keep one container for daemon and web per phase objective.
- Use `tini` as PID 1 and run process orchestration through one startup script to prevent orphaned children.
- Persist daemon state in `/config` and mount workspace through bind mounts for local repository workflows.
- Expose `3000` and `5173` so daemon and UI are both accessible from host during development.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `docker build` runs `npm install` successfully but reports advisory warnings from dependencies; non-blocking for this plan and deferred.

## User Setup Required

None - no external services or credentials required.

## Next Phase Readiness

- Dockerized environment is now available for the next phase's WebSocket integration and status UI work.
- Next plan can run `docker-compose up --build` as the primary runtime verification path.

---
*Phase: 01-foundation-and-docker*
*Completed: 2026-02-21*
