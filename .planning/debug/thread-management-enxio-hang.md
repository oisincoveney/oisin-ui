---
status: investigating
trigger: "Investigate why `bun test src/server/daemon-e2e/thread-management.e2e.test.ts -t \"covers project listing, create/switch/delete lifecycle, reconnect attach, and full cleanup\"` fails quickly with `ENXIO: no such device or address, read` and then hangs until timeout."
created: 2026-02-26T21:19:31Z
updated: 2026-02-26T21:29:18Z
---

## Current Focus

hypothesis: ENXIO is emitted by node-pty in tmux terminal sessions because pty `error` events are unhandled; test then aborts mid-RPC and cleanup rejects pending waiters, producing unhandled `Daemon client closed` and apparent hang.
test: validate with minimal non-test reproductions using `createTmuxTerminalSession(...).kill()` and `createThread()` flow, then map to tmux-terminal error-handling gaps.
expecting: ENXIO reproduces outside e2e and disappears once `ptyProcess` `error` is handled.
next_action: finalize diagnosis with precise source lines and minimal code-fix list.

## Symptoms

expected: thread lifecycle e2e passes under async provisioning model.
actual: test fails quickly with ENXIO read error, then process hangs until timeout.
errors: ENXIO: no such device or address, read
reproduction: run `bun test src/server/daemon-e2e/thread-management.e2e.test.ts -t "covers project listing, create/switch/delete lifecycle, reconnect attach, and full cleanup"`
started: after refactor where thread create returns before setup/agent provisioning completes.

## Eliminated

- hypothesis: thread-registry/session async provisioning logic itself directly throws ENXIO
  evidence: standalone repro with only `createTmuxTerminalSession` + `kill()` emits identical ENXIO without thread registry/session logic
  timestamp: 2026-02-26T21:29:18Z

## Evidence

- timestamp: 2026-02-26T21:21:55Z
  checked: targeted test run in packages/server with exact -t filter
  found: test fails in ~290ms with `ENXIO: no such device or address, read` (fd 457) and no direct stack from failure site
  implication: low-level fd read occurs very early during lifecycle scenario; likely from daemon child/pty/read stream

- timestamp: 2026-02-26T21:21:55Z
  checked: post-failure output from bun test
  found: unhandled error between tests from `DaemonClient.close()` (`clearWaiters(new Error('Daemon client closed'))`) during test context cleanup
  implication: failure path leaves async waiter(s)/operations unresolved; cleanup emits secondary unhandled error and test process does not exit cleanly

- timestamp: 2026-02-26T21:29:18Z
  checked: minimal terminal repro (`createTmuxTerminalSession` then `kill`)
  found: emits identical `ENXIO: no such device or address, read` in packages/server without daemon/thread logic
  implication: ENXIO source is terminal/pty layer, not thread registry persistence

- timestamp: 2026-02-26T21:29:18Z
  checked: node-pty direct experiment with `(ptyProcess as any).on('error', ...)`
  found: pty emits catchable `error` event (`code=ENXIO`, `syscall=read`); with listener attached, no uncaught system error noise
  implication: missing pty error listener in terminal session implementation is immediate root cause

- timestamp: 2026-02-26T21:29:18Z
  checked: `createThread` flow in daemon test context
  found: ENXIO appears during/after thread creation and before cleanup; same client close path later rejects waiters with `Daemon client closed`
  implication: e2e failure+hanging behavior is ENXIO primary fault plus secondary waiter-rejection during teardown

## Resolution

root_cause: Unhandled `error` events from `node-pty` tmux sessions (`ENXIO` on `read`) in terminal session code cause uncaught system errors during thread lifecycle operations.
fix: Add explicit `ptyProcess` error handling in tmux terminal sessions to absorb expected ENXIO/EIO read errors and map unexpected startup errors into controlled startup failure; avoid uncaught process-level errors during lifecycle transitions.
verification: ENXIO reproduced in isolated terminal repro and in createThread flow; node-pty error listener captures same error signature, confirming mechanism.
files_changed: []
