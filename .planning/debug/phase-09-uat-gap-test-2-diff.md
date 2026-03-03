---
status: diagnosed
trigger: "Investigate Phase 09 UAT gap test #2: diff panel stuck on \"Waiting for diff snapshot\" and console error from App.tsx terminal scroll path."
created: 2026-03-01T22:53:19Z
updated: 2026-03-01T22:55:05Z
---

## Current Focus

hypothesis: Confirmed: unstable TerminalView lifecycle in App causes disposed xterm instance to receive delayed `scrollToBottom`; separate App prop omission keeps diff panel header on waiting text.
test: N/A (diagnosis complete).
expecting: N/A.
next_action: Return structured root-cause report with remediation `missing[]` items.

## Symptoms

expected: Diff panel should render a diff snapshot for gap test #2.
actual: Diff panel remains on "Waiting for diff snapshot".
errors: "TypeError: Cannot read properties of undefined (reading 'dimensions')" in xterm stack with source at `src/App.tsx:260:28`.
reproduction: Run Phase 09 UAT gap test #2 flow from `.planning/phases/09-diff-panel-redesign/09-UAT.md`.
started: Observed during Phase 09 UAT.

## Eliminated

## Evidence

- timestamp: 2026-03-01T22:53:34Z
  checked: `.planning/phases/09-diff-panel-redesign/09-UAT.md`
  found: Gap test #2 reports waiting state plus TypeError from App.tsx terminal scroll path.
  implication: Investigation should prioritize App-level terminal scroll code and diff panel dependency on that render loop.

- timestamp: 2026-03-01T22:53:34Z
  checked: `/src/App.tsx`
  found: File not found at repository root `src/App.tsx`.
  implication: Need to resolve actual app source location before inspecting reported line.

- timestamp: 2026-03-01T22:53:46Z
  checked: `**/App.tsx` glob
  found: App entry is `packages/web/src/App.tsx`.
  implication: Reported source path likely from web package build output.

- timestamp: 2026-03-01T22:54:09Z
  checked: `packages/web/src/App.tsx`
  found: Delayed scroll path uses `setTimeout(... terminalRef.current?.scrollToBottom(), 250)` and is triggered after attach/reset flows.
  implication: A stale terminal ref could call into disposed xterm internals, matching `dimensions` undefined in xterm stack.

- timestamp: 2026-03-01T22:54:28Z
  checked: `packages/web/src/terminal/terminal-view.tsx`
  found: Terminal initialization/disposal effect depends on `onTerminalReady`/`onDispose` props; in App these callbacks are non-memoized, so effect can rerun on every parent render and dispose/recreate terminal.
  implication: Frequent dispose/recreate creates race windows where App's delayed `scrollToBottom` can hit disposed xterm internals (`dimensions` undefined).

- timestamp: 2026-03-01T22:54:50Z
  checked: `packages/web/src/components/diff-panel.tsx`
  found: "Waiting for diff snapshot" is shown whenever `updatedAt` prop is absent.
  implication: Header waiting state can persist even when snapshot data exists if parent fails to pass `updatedAt`.

- timestamp: 2026-03-01T22:54:50Z
  checked: `packages/web/src/diff/diff-store.ts`
  found: Diff cache entries set `updatedAt` on each payload and flip `loading` false on apply.
  implication: Store provides timestamp; App prop wiring, not store logic, explains perpetual waiting label.

- timestamp: 2026-03-01T22:55:05Z
  checked: `packages/web/src/App.tsx` and TerminalView usage grep
  found: App renders `TerminalView` twice conditionally and passes non-memoized `handleTerminalReady`; App never passes `onDispose`; `TerminalView` effect depends on callback props and disposes terminal on dependency change.
  implication: Parent rerenders can dispose terminal while App still holds old terminal ref; delayed `scrollToBottom` can call disposed xterm internals and throw `reading 'dimensions'`.

## Resolution

root_cause: "App-level terminal lifecycle race: `TerminalView` is recreated from unstable callback prop identity and conditional mounts, while App keeps stale `terminalRef` and runs delayed `scrollToBottom`; xterm throws `Cannot read properties of undefined (reading 'dimensions')` on disposed viewport internals. Additionally, App omits `updatedAt` when rendering `DiffPanel`, so header stays on 'Waiting for diff snapshot' even after snapshot updates."
fix: "Not applied (diagnosis-only)."
verification: "Static code trace across App, TerminalView, DiffPanel, and diff-store confirms causal chain and missing prop wiring."
files_changed: []
