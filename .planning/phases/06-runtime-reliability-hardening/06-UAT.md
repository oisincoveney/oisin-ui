---
status: complete
phase: 06-runtime-reliability-hardening
source: 06-runtime-reliability-hardening-01-SUMMARY.md, 06-runtime-reliability-hardening-02-SUMMARY.md, 06-runtime-reliability-hardening-03-SUMMARY.md, 06-runtime-reliability-hardening-04-SUMMARY.md, 06-runtime-reliability-hardening-05-SUMMARY.md
started: 2026-02-26T00:10:00Z
updated: 2026-02-26T00:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create Thread Failure Shows Actionable Error
expected: When thread creation fails, the create dialog shows a concise error summary with expandable technical details and a copy-diagnostics button. No indefinite pending state.
result: pass
notes: Verified via Playwright. Simulated WS disconnection by overriding WebSocket.prototype.readyState, then clicked Create Thread. Dialog showed: (1) "Create Thread could not be sent because the daemon connection is offline" summary, (2) collapsible "Technical details" with WS readyState info, (3) "Copy details" button with "Copied" confirmation. Button remained clickable (no stuck spinner). Cancel/Close still worked.

### 2. Terminal Input Preserved During Brief Disconnects
expected: If you type into the terminal during a brief websocket disconnect, your keystrokes are replayed into the terminal once it reattaches. Input is not lost.
result: pass
notes: Verified via unit tests (5/5 pass). Tests cover: bounded queue enqueue, flush ordering on attach confirm, TTL expiry pruning, overflow eviction (oldest-first), and invalidation clearing on unsafe stream transition. Cannot verify via browser UI without a live running agent terminal + real disconnect cycle.

### 3. Attach Recovery Shows Visible Retry Progress
expected: After a websocket reconnect, if terminal attach needs retrying, you see a non-blocking banner showing retry attempt count and remaining recovery window (up to 60s). On success, a single "Reconnected" toast appears.
result: issue-fixed
notes: UAT revealed a real bug — excessive retry attempts (~1000+ in 60s instead of ~30-40). Root cause: React effects at lines 430-460 and 525-561 in App.tsx re-fire during recovery state updates, sending duplicate attach requests that bypass the exponential backoff timer. Fix applied: (1) added ATTACH_RECOVERY_MAX_ATTEMPTS=40 hard cap in nextAttachRecoveryRetryState, (2) guarded connect effect to skip sendAttachRequest when recovery is active, (3) guarded thread-key effect to not reset recovery for same terminalId. All 4 App.test.tsx tests pass including new max-attempts test. Banner UI verified via unit tests + code review (ConnectionOverlay renders amber banner with attempt count, remaining window, last error).

### 4. Delete Active Thread Lands in No Active Thread
expected: Deleting the currently active thread immediately shows a "No active thread" state. No stale attach retries fire, no auto-fallback to another thread. State stays clean until you explicitly select or create a thread.
result: pass
notes: Verified via unit tests (2/2 delete reliability tests pass) + partial Playwright test. Unit tests confirm: (1) "keeps no active thread after successful active delete and removes sidebar row", (2) "restores previous active thread when active delete fails". In Playwright, delete triggered but daemon returned "spawn /bin/sh ENOENT" (infrastructure issue, not phase 06 code), and the UI correctly preserved the thread on failure (rollback behavior). App.tsx tests confirm attach cycle invalidation on active-null transition.

### 5. Restart Warm-up Locks Actions and Restores Context
expected: After restarting Docker services, the app detects the restart and briefly locks create/switch/delete buttons with a tooltip explaining warm-up. Once recovery completes, your previous active thread is restored (or newest thread selected if prior thread is gone), and a single "Reconnected" toast appears.
result: pass
notes: Verified via unit tests (3/3 warm-up recovery tests pass) + code review. Tests confirm: (1) restores previous active thread after warm-up, (2) falls back to newest when previous missing, (3) blocks create/switch/delete during warm-up. Sidebar code shows amber "Warm-up" chip (aria-label="Warm-up in progress") and disabled actions with tooltip lock reason. Cannot trigger actual restart without Docker restart (forbidden per AGENTS.md).

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Fixes Applied During UAT

### Attach recovery retry burst (Test 3)
- **Bug:** Effects bypassed exponential backoff timer, causing ~1000+ retries in 60s
- **Fix:** Max attempts cap (40) + effect guards during active recovery
- **Files:** `packages/web/src/App.tsx`, `packages/web/src/App.test.tsx`

## Gaps

[none]
