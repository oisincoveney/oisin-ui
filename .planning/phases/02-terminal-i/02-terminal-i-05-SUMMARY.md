---
phase: 02-terminal-i
plan: 05
subsystem: terminal
tags: [websocket, terminal, diagnostics, playwright, bun]

# Dependency graph
requires:
  - phase: 02-04
    provides: Stable ensure/attach request correlation for terminal bootstrap
provides:
  - Unified daemon/web default endpoint resolution on port 6767
  - Actionable ws/attach diagnostics surfaced in terminal overlay
  - Browser smoke gate for cursor/input/output terminal interactivity
affects: [03-multi-project-threads, terminal reliability, e2e]

# Tech tracking
tech-stack:
  added: [Playwright config in server workspace]
  patterns: [bun-only workspace script execution, runtime-isolated smoke harness]

key-files:
  created:
    - packages/server/playwright.config.ts
    - packages/server/e2e/terminal-web-smoke.spec.ts
  modified:
    - packages/web/src/lib/ws.ts
    - packages/server/src/server/config.ts
    - scripts/start.sh
    - packages/web/src/App.tsx
    - packages/web/src/components/ConnectionOverlay.tsx

key-decisions:
  - "Use 6767 as the single default daemon port across server config, web ws fallback, and startup script defaults."
  - "Disable speech providers inside the smoke test runtime to prevent model-download startup delays from masking terminal regressions."

patterns-established:
  - "Terminal overlay telemetry pattern: always show endpoint/ws target plus reason/hint when disconnected."
  - "Smoke harness pattern: spawn daemon + web via bun with isolated ports and temp PASEO_HOME."

# Metrics
duration: 5m
completed: 2026-02-22
---

# Phase 2 Plan 5: Terminal Interactivity Smoke and Diagnostics Summary

**Daemon/web endpoint defaults now converge on 6767, attach/ws failures are visible in-overlay with endpoint telemetry, and a Playwright smoke test enforces terminal input/output interactivity via bun-run runtime boot.**

## Performance

- **Duration:** 5m
- **Started:** 2026-02-23T02:08:22Z
- **Completed:** 2026-02-23T02:13:05Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Unified default daemon endpoint handling so web ws fallback, daemon listen default resolution, and startup script defaults no longer drift.
- Extended terminal overlay diagnostics to expose ws target URL, endpoint, failure reason, and actionable hint when attach/ws setup fails.
- Added browser-level terminal smoke coverage that boots isolated daemon+web processes and asserts interactive command echo flow.

## Task Commits

Each task was committed atomically:

1. **Task 1: Unify daemon endpoint defaults across server runtime and web ws resolution** - `83a1339` (fix)
2. **Task 2: Surface ws endpoint mismatch and attach failure diagnostics in terminal UI** - `ae088e4` (feat)
3. **Task 3: Add browser-level terminal interactivity smoke test** - `274770c` (test)

**Plan metadata:** recorded in execution docs commit for this plan

## Files Created/Modified
- `packages/web/src/lib/ws.ts` - Normalized daemon port fallback parsing and expanded ws diagnostics with hint state.
- `packages/server/src/server/config.ts` - Resolved default listen port from provided env context for consistent runtime defaults.
- `scripts/start.sh` - Set default daemon listen to `0.0.0.0:6767` and continued exporting `VITE_DAEMON_PORT` from `PASEO_LISTEN`.
- `packages/web/src/App.tsx` - Threaded ws URL and ws hint diagnostics into the terminal overlay props.
- `packages/web/src/components/ConnectionOverlay.tsx` - Rendered ws endpoint/URL plus reason/hint telemetry during non-connected states.
- `packages/server/playwright.config.ts` - Added dedicated server workspace Playwright config for e2e smoke execution.
- `packages/server/e2e/terminal-web-smoke.spec.ts` - Added bun-based isolated runtime smoke test validating terminal interaction path.

## Decisions Made
- Kept daemon default behavior anchored to `6767` and used env-derived `PASEO_LISTEN` -> `VITE_DAEMON_PORT` propagation as the startup single source of truth.
- Validated terminal readiness by focused `Terminal input` textbox + echoed command output instead of brittle DOM cursor selector polling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Smoke runtime startup timed out due local speech model bootstrap**
- **Found during:** Task 3 (browser-level terminal interactivity smoke test)
- **Issue:** Daemon startup in e2e attempted local speech model provisioning, delaying health readiness and causing smoke timeout.
- **Fix:** Set `PASEO_DICTATION_ENABLED=0` and `PASEO_VOICE_MODE_ENABLED=0` in smoke runtime env; added `afterAll` runtime guard for failed setup path.
- **Files modified:** `packages/server/e2e/terminal-web-smoke.spec.ts`
- **Verification:** `bun run --filter @getpaseo/server test:e2e -- e2e/terminal-web-smoke.spec.ts` passes.
- **Committed in:** `274770c` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was required for deterministic smoke execution; no scope creep.

## Issues Encountered
- Initial cursor assertion used `.xterm-cursor` presence and was flaky/non-portable with renderer state; replaced with focused terminal input + output assertion.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal interactivity regression is now gated by browser smoke and actionable diagnostics are available for ws/attach failures.
- No new blockers identified for subsequent phase planning.

---
*Phase: 02-terminal-i*
*Completed: 2026-02-22*
