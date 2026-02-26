---
status: diagnosed
phase: 06-runtime-reliability-hardening
source: 06-runtime-reliability-hardening-01-SUMMARY.md, 06-runtime-reliability-hardening-02-SUMMARY.md, 06-runtime-reliability-hardening-03-SUMMARY.md, 06-runtime-reliability-hardening-04-SUMMARY.md, 06-runtime-reliability-hardening-05-SUMMARY.md, 06-runtime-reliability-hardening-06-SUMMARY.md
started: 2026-02-26T05:12:23Z
updated: 2026-02-26T05:30:29Z
---

## Current Test

[testing complete]

## Tests

### 1. Create failure is bounded and actionable
expected: While disconnected from daemon websocket, creating a thread shows a concise error summary, expandable technical details, and copyable diagnostics. The create flow exits pending state promptly and stays interactable.
notes: Manual Playwright browser verification against docker web UI. Forced websocket offline by patching `WebSocket.prototype.readyState`, submitted create thread, observed concise summary message, expandable technical details, and Copy details -> Copied confirmation. Create button stayed interactable (no stuck pending).
result: pass

### 2. Terminal input survives brief disconnect and replays on reattach
expected: If terminal input is entered during a brief transport disconnect, it is buffered and replayed once attach confirms, with no duplicated or lost input.
result: pass
notes: Verified replay semantics via deterministic queue/replay test suite (`packages/web/src/terminal/terminal-stream.test.ts`) with 5/5 pass covering enqueue, flush ordering, TTL pruning, overflow eviction, and invalidation clear behavior.

### 3. Attach recovery shows bounded retry UX and single success signal
expected: After reconnect with attach failures, a visible retry banner shows attempt and remaining 60s window; retries are bounded/exponential and success emits one Reconnected signal.
result: pass
notes: Verified via Playwright e2e (`packages/server/e2e/thread-management-web.spec.ts`) test `restart warm-up locks actions and exposes bounded attach recovery indicator` passed, exercising retry banner bounded window behavior.

### 4. Active delete lands in no-active state without stale retries
expected: Deleting the active thread immediately shows No active thread, removes deleted row, prevents stale attach retries, and does not auto-fallback to another thread.
result: pass
notes: Verified via Playwright e2e (`packages/server/e2e/thread-management-web.spec.ts`) test `deleting the active thread immediately lands on no active thread` passed.

### 5. Restart warm-up locks actions and restores context deterministically
expected: On daemon restart (serverId change), create/switch/delete lock during warm-up with explicit reason; after settle, prior active thread is restored or newest fallback selected.
result: pass
notes: Verified via Playwright e2e (`packages/server/e2e/thread-management-web.spec.ts`) test `restart warm-up locks actions and exposes bounded attach recovery indicator` passed, including lock-state behavior during warm-up and bounded recovery telemetry.

### 6. Deterministic reliability regressions execute in one repeatable path
expected: The documented command sequence for Phase 06 reliability verification runs successfully and maps RUN-01..RUN-04 to deterministic evidence.
result: issue
reported: "Documented deterministic command sequence did not run end-to-end: daemon regression command timed out waiting for message (10000ms) in daemon-client while web Playwright regressions passed (7/7)."
severity: blocker

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "The documented command sequence for Phase 06 reliability verification runs successfully and maps RUN-01..RUN-04 to deterministic evidence."
  status: failed
  reason: "User reported: Documented deterministic command sequence did not run end-to-end: daemon regression command timed out waiting for message (10000ms) in daemon-client while web Playwright regressions passed (7/7)."
  severity: blocker
  test: 6
  root_cause: "First RPC after websocket open is dropped due a connect/readiness race, so createDaemonTestContext's immediate fetchAgents request never receives a response and times out at 10s."
  artifacts:
    - path: "packages/server/src/server/test-utils/daemon-test-context.ts:45"
      issue: "Sends fetchAgents immediately after connect with no readiness barrier."
    - path: "packages/server/src/client/daemon-client.ts:1088"
      issue: "Hard 10s response wait fails when first request is dropped."
    - path: "packages/server/src/server/websocket-server.ts:316"
      issue: "Connection path can accept open before first-message handling/session setup is fully ready."
    - path: "packages/server/src/server/agent/providers/claude-agent.ts:508"
      issue: "Synchronous execSync provider check in startup widens race window."
  missing:
    - "Add explicit post-connect readiness barrier before first RPC in daemon test context/client."
    - "Harden websocket connect path to queue/drain earliest messages after session init."
    - "Move synchronous provider checks off connect-critical startup path."
  debug_session: ".planning/debug/phase-06-fetchagents-timeout.md"
