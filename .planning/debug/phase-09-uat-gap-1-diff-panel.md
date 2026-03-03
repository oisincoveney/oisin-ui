---
status: diagnosed
trigger: "Investigate Phase 09 UAT gap test #1: diff panel opens/closes repeatedly and is unstable."
created: 2026-03-01T22:53:18Z
updated: 2026-03-01T22:55:55Z
---

## Current Focus

hypothesis: Diff panel is auto-forced closed by diff-target churn while user is trying to keep it open.
test: Trace every non-user write to `panel.isOpen` and identify what can trigger it repeatedly.
expecting: A store update path closes the panel on target changes derived from thread-store updates.
next_action: return diagnosis with file/line evidence and minimal fix requirements.

## Symptoms

expected: Diff panel should open and close once per explicit user action and remain stable.
actual: Diff panel repeatedly opens and closes; UI appears unstable.
errors: "diff viewer is going nuts opening and closing"
reproduction: Run app at http://127.0.0.1:44285 and interact with diff viewer controls from Phase 09 UAT test #1.
started: Observed during Phase 09 UAT.

## Eliminated

## Evidence

- timestamp: 2026-03-01T22:55:55Z
  checked: `.planning/phases/09-diff-panel-redesign/09-UAT.md`
  found: Gap #1 reports repeated open/close instability when trying to use the diff panel.
  implication: Need to find non-user state writes to diff panel open-state.

- timestamp: 2026-03-01T22:55:55Z
  checked: `packages/web/src/diff/diff-store.ts`
  found: `setActiveDiffThread(...)` unconditionally resets `panel.isOpen` to `false` whenever target changes (`activeThreadKey` OR `cwd`) at lines 280-300.
  implication: Any target churn force-closes panel even after user explicitly opened it.

- timestamp: 2026-03-01T22:55:55Z
  checked: `packages/web/src/main.tsx`
  found: `subscribeThreadStore` calls `setActiveDiffThread(getActiveThreadDiffTarget(...))` on every thread-store update (lines 20-22).
  implication: Panel-close path can fire from broad thread-store churn, not only explicit thread switching.

- timestamp: 2026-03-01T22:55:55Z
  checked: `packages/web/src/thread/thread-store.ts`
  found: Diff target `cwd` is derived from `activeThread.worktreePath ?? project.repoRoot` (line 1182).
  implication: If `worktreePath` availability/value changes during runtime synchronization, target is treated as changed and panel is closed again.

- timestamp: 2026-03-01T22:55:55Z
  checked: `packages/web/src/App.tsx`
  found: App also force-closes panel when `activeThreadKey` changes (lines 510-519), creating a second auto-close path.
  implication: Combined close paths amplify instability perception during thread/runtime churn.

## Resolution

root_cause: Diff panel open-state is coupled to diff-target synchronization; thread-store updates can repeatedly trigger target changes, and `setActiveDiffThread` forcibly sets `panel.isOpen=false` on each change, so user-opened panel keeps collapsing.
fix: Decouple panel visibility from background target sync. Only auto-close on explicit thread switch/delete (not on `cwd`/sync churn), and remove duplicate auto-close path overlap.
verification: Diagnose-only (no code changes applied).
files_changed: []
