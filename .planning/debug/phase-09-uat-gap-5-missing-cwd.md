---
status: resolved
trigger: "Diagnose gap #2 from .planning/phases/09-diff-panel-redesign/09-UAT.md: staged rename row truth holds but git status in thread fails with Unable to read current working directory"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T01:20:00Z
---

## Current Focus

hypothesis: Stale thread worktreePath survives deletion, then terminal rehydrate reuses a stale tmux session tied to that path.
test: Trace worktree archive/deletion lifecycle, thread registry persistence, and attach_terminal_stream -> ensureThreadTerminal flow.
expecting: Find missing worktree/session invalidation plus stale cwd reuse in terminal bootstrap.
next_action: Diagnosis complete.

## Symptoms

expected: For a staged rename, file row shows old_path -> new_path and opens normally.
actual: Running git status in thread fails with fatal unable to read current working directory (no such file or directory).
errors: fatal: Unable to read current working directory: No such file or directory.
reproduction: Open affected thread and run git status.
started: Reported in UAT test 5.

## Eliminated

## Evidence

- timestamp: 2026-03-01T01:04:00Z
  checked: .planning/phases/09-diff-panel-redesign/09-UAT.md
  found: Gap #5 report is terminal-side (`git status` fails with unable to read cwd), while rename rendering truth is about diff UI row rendering.
  implication: Rename display path can be correct even if terminal cwd lifecycle is broken.

- timestamp: 2026-03-01T01:05:00Z
  checked: .planning/phases/09-diff-panel-redesign/09-08-SUMMARY.md
  found: Prior fix added stale-cwd recovery only for diff subscription (`resolveValidDiffCwd`), not terminal attach/create.
  implication: Diff can appear healthy while terminal still targets stale/deleted thread worktree cwd.

- timestamp: 2026-03-01T01:07:00Z
  checked: packages/web/src/thread/thread-store.ts:1182
  found: Active thread cwd always comes from `activeThread.worktreePath` first.
  implication: Persisted stale worktreePath is propagated to runtime consumers (diff/terminal flows).

- timestamp: 2026-03-01T01:10:00Z
  checked: packages/server/src/server/session.ts:6992
  found: Terminal rehydrate path calls `ensureThreadTerminal({ cwd: worktreePath })` with no existence/git validation.
  implication: Deleted worktree paths are accepted as terminal cwd inputs.

- timestamp: 2026-03-01T01:12:00Z
  checked: packages/server/src/terminal/terminal-manager.ts:447
  found: Thread session key is deterministic per `projectId:threadId`; manager reuses session by that key.
  implication: Old tmux session for a thread can be reattached even after filesystem state changed.

- timestamp: 2026-03-01T01:14:00Z
  checked: packages/server/src/terminal/tmux-terminal.ts:122
  found: `ensureTmuxSession` short-circuits if tmux session already exists (`has-session`), so cwd is not reset on reattach.
  implication: Existing tmux sessions preserve their original cwd context.

- timestamp: 2026-03-01T01:15:00Z
  checked: packages/server/src/server/session.ts:4743
  found: Worktree archive path kills terminals only from in-memory directory index (`killTerminalsUnderPath`) and does not clear thread links/worktreePath.
  implication: After restart or out-of-band state drift, stale tmux sessions and stale thread worktreePath can survive deletion.

- timestamp: 2026-03-01T01:17:00Z
  checked: packages/server/src/terminal/tmux-terminal.ts:184
  found: Missing cwd falls back to `process.cwd()` for spawn, but returned session `cwd` remains original input (`cwd`).
  implication: Stale cwd leaks back into runtime metadata/maps even when spawn fallback happens.

## Resolution

root_cause: Thread/worktree lifecycle and terminal lifecycle are inconsistent. Deleted/stale `thread.links.worktreePath` is not invalidated, and terminal rehydrate reuses deterministic thread tmux sessions without cwd validation/reset. When the reused tmux session's pane cwd points to a removed worktree, commands in that terminal fail with `Unable to read current working directory`.
fix: Diagnose-only; no code changes applied.
verification: Verified by tracing end-to-end path: persisted worktreePath -> thread switch/attach rehydrate -> ensureThreadTerminal(sessionKey reuse) -> tmux has-session reattach preserving stale cwd.
files_changed: []

## Findings

root_cause: Thread terminals can be reattached to stale tmux sessions whose pane cwd points to a deleted worktree because stale `worktreePath` is never invalidated and terminal rehydrate does not validate/reset cwd.

artifacts:
- path: packages/server/src/server/session.ts:6992
  issue: Rehydrate uses `thread.links.worktreePath` directly (`ensureThreadTerminal`) with no existence/git checks.
- path: packages/server/src/server/session.ts:4743
  issue: Worktree archive cleanup is in-memory-terminal based and does not clear/update thread `worktreePath` links.
- path: packages/server/src/terminal/terminal-manager.ts:447
  issue: Deterministic session key reuse (`projectId:threadId`) reattaches prior tmux session identity.
- path: packages/server/src/terminal/tmux-terminal.ts:122
  issue: Existing tmux session short-circuits startup (`has-session`), so cwd is not recreated/reset.
- path: packages/server/src/terminal/tmux-terminal.ts:184
  issue: Spawn fallback uses `process.cwd()` when missing, but exported `session.cwd` remains stale input, leaking bad cwd into runtime metadata.
- path: packages/web/src/thread/thread-store.ts:1182
  issue: Client diff target cwd prefers persisted `worktreePath`, propagating stale path downstream.

missing:
- Worktree existence/git validation before `ensureThreadTerminal` on switch/rehydrate.
- Registry reconciliation to clear/repair `thread.links.worktreePath` when worktree is deleted/archived.
- Terminal recovery path equivalent to diff's `resolveValidDiffCwd` (thread-aware fallback repo root).
- Guaranteed tmux session invalidation for archived/deleted thread worktrees even after daemon restart.
- Consistent terminal cwd reporting (do not return stale input when launch cwd is substituted).

confidence: high
