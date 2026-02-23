---
status: investigating
trigger: "Diagnose this UAT blocker for phase 02-terminal-i and return concrete root cause, artifacts, missing fixes, and debug session path."
created: 2026-02-23T01:49:23Z
updated: 2026-02-23T01:51:09Z
---

## Current Focus

hypothesis: Web client connects websocket to wrong default port, leaving terminal unattached/disconnected so cursor/input never become active.
test: Validate active daemon listen endpoint and correlate with web websocket default + App attach gating.
expecting: Daemon endpoint differs from web default target, causing attach never to occur in UAT runtime.
next_action: Produce root-cause artifacts and concrete missing fix actions for phase UAT gap.

## Symptoms

expected: Opening the web client shows a full-screen, interactive terminal where user can place cursor, type, and output renders.
actual: User reports cursor not visible and typing does not work.
errors: "No, I cannot see the cursor or type text. It is clear that the fixes you had \"implemented\" were not tested."
reproduction: Open web client in phase 02-terminal-i UAT flow and attempt to focus terminal and type.
started: During phase 02-terminal-i UAT.

## Eliminated

- hypothesis: Server-side ensure/attach race remains root blocker for initial interactivity.
  evidence: Server handlers include requestId-correlated ensure responses and attach stream non-null/error handling paths; no direct evidence of initial attach refusal when transport is healthy.
  timestamp: 2026-02-23T01:50:24Z

## Evidence

- timestamp: 2026-02-23T01:50:24Z
  checked: .planning/phases/02-terminal-i/02-terminal-i-UAT.md
  found: UAT blocker is strictly Test 1 (terminal not interactive), all later tests skipped due to inability to type.
  implication: Failure occurs at earliest bootstrap/connectivity layer, before reconnect/output edge cases.

- timestamp: 2026-02-23T01:50:24Z
  checked: packages/web/src/lib/ws.ts
  found: Websocket URL uses `const port = import.meta.env.VITE_DAEMON_PORT || "3000"`.
  implication: Without explicit env override, web client targets port 3000 instead of daemon default 6767 used by this repo setup.

- timestamp: 2026-02-23T01:50:24Z
  checked: AGENTS/CLAUDE guidance for this repo runtime
  found: Daemon default endpoint is `localhost:6767` and web app runs separately.
  implication: Current code default does not match documented runtime, causing failed or wrong websocket target in typical UAT setup.

- timestamp: 2026-02-23T01:51:09Z
  checked: `bun run cli -- daemon status`
  found: CLI reports daemon listen target `127.0.0.1:6767` while daemon API was unreachable in this shell.
  implication: Standard client endpoint expectation is 6767; web fallback to 3000 is misaligned and can leave UI disconnected/non-interactive unless env override is set.

- timestamp: 2026-02-23T01:51:09Z
  checked: packages/server/src/server/config.ts
  found: `DEFAULT_PORT = 3000` while nearby comment states default listen is `127.0.0.1:6767`.
  implication: Port-default contract is inconsistent across runtime/config/docs, increasing chance UAT runs web against wrong websocket endpoint.

- timestamp: 2026-02-23T01:50:24Z
  checked: packages/web/src/App.tsx
  found: Terminal interactivity only activates after successful attach (`adapter.setAttached(true)`, cursor blink set true); on disconnected/reconnecting it clears attach state and sets `cursorBlink = false`.
  implication: If websocket never reaches daemon, user sees non-interactive terminal symptoms exactly matching report (no active cursor/type path).

## Resolution

root_cause: Web websocket client defaults to port 3000 (`packages/web/src/lib/ws.ts`) instead of daemon port 6767, so default UAT runs fail to attach terminal stream and App leaves cursor/input inactive.
fix: 
verification: 
files_changed: []
