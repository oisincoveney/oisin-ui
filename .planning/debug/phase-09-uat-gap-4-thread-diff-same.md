# Phase 09 UAT Gap 4 - Thread diff isolation failure

## Scope checked
- `.planning/phases/09-diff-panel-redesign/09-UAT.md` (gap #1 report)
- `.planning/phases/09-diff-panel-redesign/09-08-PLAN.md` and `09-08-SUMMARY.md`
- `.planning/phases/09-diff-panel-redesign/09-09-SUMMARY.md`
- `packages/web/src/thread/thread-store.ts`
- `packages/web/src/diff/diff-store.ts`
- `packages/web/src/main.tsx`
- `packages/server/src/server/session.ts`
- `packages/server/src/shared/messages.ts`

## Findings

1) Web routing is thread-keyed but sends only `cwd` for diff subscribe.
- `getActiveThreadDiffTarget()` resolves `cwd = activeThread.worktreePath ?? project.repoRoot`.
- Diff subscribe payload contains `subscriptionId`, `cwd`, `compare`, `requestId` only (no `projectId`/`threadId`).

2) Server stale-cwd recovery is global and non-thread-aware.
- `resolveValidDiffCwd(requestedCwd)` checks requested cwd, then loops `threadRegistry.listProjects()` and returns the *first* repoRoot that is a valid git repo.
- It does not map requested cwd to owning thread/project before fallback.

3) Diff watcher cache key is `(cwd, compare)`.
- `buildCheckoutDiffTargetKey()` uses only `cwd` + compare mode/baseRef.
- After stale recovery collapses multiple requests to one fallback cwd, all those subscriptions share the same diff target/snapshot.

## Root cause
The stale-worktree fix (09-08) removed the "Not a git repository" error by falling back to a valid repoRoot, but fallback resolution is not thread-aware. Because subscribe requests carry only `cwd`, server recovery can collapse multiple stale thread requests onto one repoRoot, and diff routing then intentionally coalesces them via target key `(cwd, compare)`. Result: multiple threads show the same diff.

## Artifact issues
- `packages/server/src/server/session.ts`: `resolveValidDiffCwd()` chooses first valid project repoRoot, not the owning thread/project for the stale cwd; causes cross-thread cwd collapse.
- `packages/server/src/shared/messages.ts`: `SubscribeCheckoutDiffRequestSchema` lacks thread/project identity fields needed for deterministic stale-cwd recovery.
- `packages/web/src/diff/diff-store.ts`: subscribe request sends only `cwd`; cannot help server select thread-specific fallback.
- `packages/web/src/thread/thread-store.ts`: diff target intentionally falls back to `project.repoRoot` when `worktreePath` is missing, which is shared by all threads in a project (expected behavior but contributes to identical diffs when worktree linkage is broken).

## Concrete missing fixes
- Add thread identity to diff subscribe contract (`projectId`, `threadId` or `threadKey`) and pass it from web store.
- In server subscribe handler, resolve stale cwd by thread context first:
  - lookup the thread from provided identity;
  - if thread has a valid `worktreePath`, use it;
  - else fallback to that thread's owning project `repoRoot` (not first global project).
- Keep current global fallback only as final safety net when thread identity is absent/invalid.
- Add regression coverage: multi-thread scenario where at least two stale worktree paths subscribe concurrently and must produce thread-specific diffs (or explicit per-thread fallback behavior).
