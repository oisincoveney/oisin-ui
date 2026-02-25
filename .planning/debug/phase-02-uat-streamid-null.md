---
status: diagnosed
trigger: "Investigate blocker from Phase 02 UAT in /Users/oisin/dev/oisin-ui.\n\nIssue:\n- Browser app at http://127.0.0.1:5173 loads xterm, sends terminal_input, but attach responses repeatedly return streamId=null and daemon logs warn 'Terminal not found for input'.\n- Websocket traces show repeated ensure_default_terminal_request/response loops, multiple terminal IDs generated, attach requests for each.\n\nContext files:\n- .planning/phases/02-terminal-i/02-terminal-i-UAT.md\n- packages/web/src/App.tsx\n- packages/server/src/server/session.ts\n- Any related terminal manager/session files.\n\nTasks:\n1) Find root cause with high confidence.\n2) Identify exact artifacts/files and missing changes needed.\n3) Provide concise fix plan suitable for adding root_cause/artifacts/missing fields in UAT gap.\n4) Include verification commands to prove fix.\n\nDo research/debug only. No code changes."
created: 2026-02-22T23:17:14Z
updated: 2026-02-22T23:22:39Z
---

## Current Focus

hypothesis: Root cause confirmed: client sends concurrent ensure_default_terminal requests; server ensureDefaultTerminal is not concurrency-safe and can mint multiple terminal IDs; stale IDs then fail attach/input once terminal lifecycle diverges.
test: completed
expecting: completed
next_action: return diagnosis with artifacts + missing changes + verification commands

## Symptoms

expected: xterm attaches once to stable default terminal and terminal_input routes to live terminal stream.
actual: attach responses repeatedly return streamId=null; terminal_input triggers daemon warning "Terminal not found for input".
errors: daemon warns "Terminal not found for input"; websocket trace shows repeated ensure_default_terminal_request/response loops with multiple terminal IDs.
reproduction: open browser app at http://127.0.0.1:5173 and interact with terminal input in Phase 02 UAT flow.
started: observed during Phase 02 UAT.

## Eliminated

- hypothesis: Default `opencode` command immediately exits in this environment, solely causing all attach failures.
  evidence: Direct probe kept ensured terminal alive (`m.getTerminal(id) === true` after delay); issue still explains only part of symptom.
  timestamp: 2026-02-22T23:22:39Z

## Evidence

- timestamp: 2026-02-22T23:17:52Z
  checked: .planning/phases/02-terminal-i/02-terminal-i-UAT.md
  found: Test 2 is blocker with exact symptom "attach_terminal_stream_response streamId=null" and daemon warning "Terminal not found for input".
  implication: Need attach/input path mismatch, not rendering issue.

- timestamp: 2026-02-22T23:17:52Z
  checked: packages/web/src/App.tsx
  found: `ensure_default_terminal_request` is sent in two places on connected state change and on terminal ready; every response immediately triggers `sendAttachRequest`.
  implication: Client can issue repeated ensure/attach cycles even within one connection lifecycle.

- timestamp: 2026-02-22T23:17:52Z
  checked: packages/server/src/terminal/terminal-manager.ts
  found: `ensureDefaultTerminal()` reuses `defaultTerminalId` if live, otherwise creates terminal and updates in-memory `defaultTerminalId` map.
  implication: If session input terminalId is unknown, failure likely from stale/foreign terminalId rather than intentional null behavior in manager.

- timestamp: 2026-02-22T23:22:39Z
  checked: packages/server/src/server/session.ts:6569 and packages/server/src/server/session.ts:6482
  found: `attach_terminal_stream_response` returns `streamId: null` only when `terminalManager.getTerminal(msg.terminalId)` is missing; `Terminal not found for input` warning comes from the same missing lookup path.
  implication: Symptom requires client using terminal IDs not present in current manager map.

- timestamp: 2026-02-22T23:22:39Z
  checked: packages/web/src/App.tsx:95 and packages/web/src/App.tsx:208
  found: App emits `ensure_default_terminal_request` in two independent paths (connection effect + terminal-ready callback) and does not correlate ensure responses by requestId before mutating `terminalIdRef` + attach.
  implication: Duplicate/overlapping ensure→attach cycles are expected; stale ensure responses can re-point client terminal identity.

- timestamp: 2026-02-22T23:22:39Z
  checked: packages/server/src/terminal/terminal-manager.ts:323 and runtime probe `Promise.all([ensureDefaultTerminal(), ensureDefaultTerminal()])`
  found: `ensureDefaultTerminal()` has no in-flight lock; concurrent calls produced two distinct terminal IDs in practice.
  implication: Client's duplicate ensure requests can mint multiple "default" terminals, matching websocket trace of multiple terminal IDs.

## Resolution

root_cause: Client and server both miss idempotency/serialization in default-terminal handshake. App sends overlapping ensure_default_terminal requests and accepts every ensure response without request correlation; server ensureDefaultTerminal is non-atomic under concurrency and can create multiple terminal IDs. This creates terminal identity churn; subsequent attach/input for stale IDs hits getTerminal miss, yielding streamId=null and "Terminal not found for input".
fix: Do not edit in this session. Required changes: (1) client ensures one in-flight ensure request + response requestId matching, (2) server serializes ensureDefaultTerminal (single-flight lock) so concurrent calls return the same terminal instance, (3) regression test ensure->attach->input under concurrent ensure requests.
verification: Validate with websocket trace + e2e: no duplicate ensure loops, stable single terminal ID, attach streamId is numeric, no "Terminal not found for input" logs while typing and resizing.
files_changed: []
