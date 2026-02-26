---
status: diagnosed
trigger: "Investigate this Phase 06 UAT gap and return structured diagnosis only.\n\nContext files:\n- /Users/oisin/dev/oisin-ui/.planning/phases/06-runtime-reliability-hardening/06-UAT.md\n- /Users/oisin/dev/oisin-ui/packages/server/src/server/daemon-e2e/thread-management.e2e.test.ts\n- /Users/oisin/dev/oisin-ui/packages/server/src/server/test-utils/daemon-test-context.ts\n- /Users/oisin/dev/oisin-ui/packages/server/src/client/daemon-client.ts\n- /Users/oisin/dev/oisin-ui/packages/server/src/server/agent/providers/claude-agent.ts\n\nObserved failure:\nRunning `bun test src/server/daemon-e2e/thread-management.e2e.test.ts` from packages/server times out waiting for message (10000ms) at daemon-client waitForWithCancel during fetchAgents in createDaemonTestContext. Web Playwright suite passes.\n\nDeliver:\n1) root_cause (single most likely)\n2) contributing_factors (0-3 bullets)\n3) artifacts array [{path, issue}]\n4) missing array (specific fix actions)\n5) severity (blocker/major/minor)\n6) confidence (high/medium/low)\n7) optional debug_session path if you create one."
created: 2026-02-26T05:17:02Z
updated: 2026-02-26T05:29:54Z
---

## Current Focus

hypothesis: first session RPC sent immediately after websocket open is dropped before server message handler is effectively attached, so initial fetchAgents hangs
test: validate first-request behavior with minimal repro (first immediate request vs delayed/second request)
expecting: immediate first fetchAgents fails with timeout, while delayed or second fetchAgents succeeds on same connection
next_action: return diagnosis with root cause and concrete fix actions

## Symptoms

expected: thread-management daemon e2e test initializes daemon test context and proceeds to assertions
actual: test times out after 10000ms waiting for message in daemon-client waitForWithCancel during fetchAgents in createDaemonTestContext
errors: "timed out waiting for message (10000ms)"
reproduction: run `bun test src/server/daemon-e2e/thread-management.e2e.test.ts` from `packages/server`
started: observed in Phase 06 UAT gap report

## Eliminated

## Evidence

- timestamp: 2026-02-26T05:20:11Z
  checked: ran `bun test src/server/daemon-e2e/thread-management.e2e.test.ts`
  found: all tests fail in `beforeEach` at `createDaemonTestContext -> client.fetchAgents` with `Timeout waiting for message (10000ms)`
  implication: failure occurs before thread workflow assertions; setup handshake/request path is the blocker

- timestamp: 2026-02-26T05:24:03Z
  checked: inspected `createDaemonTestContext` and fetch path
  found: context calls `await client.connect(); await client.fetchAgents(...)` immediately, and client waiter rejects only on timeout when no matching response arrives
  implication: first post-connect RPC has no server response in failing path

- timestamp: 2026-02-26T05:26:02Z
  checked: minimal repro script using test daemon/client with `ping` then `fetchAgents`
  found: first immediate RPC (`ping`) times out; subsequent `fetchAgents` on same connection succeeds and receives `fetch_agents_response`
  implication: connection is alive, but first request after open is prone to drop

- timestamp: 2026-02-26T05:27:23Z
  checked: minimal repro with immediate first `fetchAgents` then second `fetchAgents`
  found: first call fails, second call succeeds consistently
  implication: deterministic first-message loss explains `createDaemonTestContext` timeout

- timestamp: 2026-02-26T05:28:14Z
  checked: minimal repro with 50ms delay after `connect` before first `fetchAgents`
  found: delayed first call succeeds
  implication: timing/race around socket-readiness (not payload schema or requestId mismatch) is primary mechanism

## Resolution

root_cause: daemon-client sends first session request immediately on websocket `open`, but server-side direct-socket handling can drop that earliest request due connect/readiness race; `createDaemonTestContext` makes `fetchAgents` that first request, so it times out waiting for response.
fix:
verification:
files_changed: []
