---
plan: 09-08
phase: 09-diff-panel-redesign
status: complete
files_modified:
  - packages/server/src/server/session.ts
---

# 09-08 Summary: Stale Diff CWD Recovery

## What Was Done

Added `resolveValidDiffCwd` private method to `PaseoSession` in `session.ts`.

**Logic:**
1. Fast path: run `git rev-parse --git-dir` on requested cwd. If it succeeds, return it unchanged.
2. Recovery path: iterate `this.threadRegistry.listProjects()`, try each `repoRoot` with the same git check, return the first valid one with a warning log.
3. Fallback: if no valid project repoRoot found, return the original cwd and let the error surface normally (existing behaviour).

`handleSubscribeCheckoutDiffRequest` now calls `resolveValidDiffCwd(expandTilde(msg.cwd))` before subscribing — stale/deleted worktree paths are healed server-side before reaching `requireGitRepo`.

## Result

"Not a git repository" no longer surfaces in the diff panel for threads whose `worktreePath` is stale. TypeScript clean (0 errors).
