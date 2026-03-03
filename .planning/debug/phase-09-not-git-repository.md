---
status: diagnosed
trigger: "Investigate Phase 09 UAT gap tests #3/#4: diff panel reports \"Not a git repository\" for thread worktree paths, blocking staged/unstaged separation and rename visibility.\n\nContext:\n- UAT file: .planning/phases/09-diff-panel-redesign/09-UAT.md\n- Observed message: Not a git repository: /config/worktrees/.../thread-id\n\nTask:\n1) Determine likely root cause in daemon/worktree setup or diff request path handling.\n2) Pinpoint files and code paths responsible.\n3) Provide concrete fix requirements as missing[] list for planner.\n4) Provide artifacts[] and debug_session path.\n\nRepo-only investigation, no edits. Return concise structured output."
created: 2026-03-01T22:53:19Z
updated: 2026-03-01T22:56:06Z
---

## Current Focus

hypothesis: Confirmed: stale/invalid thread worktreePath is propagated to diff subscription without validation or fallback.
test: Completed codepath trace and source inspection.
expecting: n/a
next_action: return diagnosis with missing[] requirements and artifacts list

## Symptoms

expected: Diff panel should run git diff against thread worktree and show staged vs unstaged plus rename visibility.
actual: Diff panel reports "Not a git repository" for thread worktree path and cannot separate staged/unstaged or show rename changes.
errors: "Not a git repository: /config/worktrees/.../thread-id"
reproduction: Run Phase 09 UAT gap tests #3/#4 in diff panel redesign and request diff for thread worktree path.
started: Observed during Phase 09 UAT gap tests #3/#4.

## Eliminated

- hypothesis: Ownership/base-ref logic in checkout-git rejects a valid repo path and produces the "Not a git repository" error.
  evidence: getCheckoutDiff calls requireGitRepo(cwd) first (checkout-git.ts:1211); ownership logic runs later and cannot produce this initial error.
  timestamp: 2026-03-01T22:55:46Z

## Evidence

- timestamp: 2026-03-01T22:53:36Z
  checked: .planning/phases/09-diff-panel-redesign/09-UAT.md
  found: Tests 3 and 4 fail because diff snapshot state includes "Not a git repository" for selected thread worktree path, which blocks staged/unstaged sections and rename test.
  implication: Root cause is upstream of UI rendering; diff backend/path resolution likely returning git error for thread path.

- timestamp: 2026-03-01T22:55:46Z
  checked: packages/web/src/thread/thread-store.ts:1182 and packages/web/src/diff/diff-store.ts:120-123
  found: Diff subscription cwd is taken directly from activeThread.worktreePath (fallback repoRoot only when worktreePath is null), then sent as subscribe_checkout_diff_request cwd.
  implication: Any non-null but stale thread worktreePath bypasses fallback and directly drives diff backend cwd.

- timestamp: 2026-03-01T22:55:46Z
  checked: packages/server/src/server/session.ts:4253-4267 and packages/server/src/utils/checkout-git.ts:1206-1212
  found: Server expands msg.cwd and passes it to getCheckoutDiff via computeCheckoutDiffSnapshot; getCheckoutDiff immediately enforces requireGitRepo(cwd) and throws NotGitRepoError when invalid.
  implication: Diff subscribe path has no pre-validation or auto-repair for stale thread worktree paths.

- timestamp: 2026-03-01T22:55:46Z
  checked: packages/server/src/server/session.ts:775-800 and packages/server/src/server/thread/thread-registry.ts
  found: Thread summaries expose thread.links.worktreePath verbatim; registry schema accepts arbitrary non-empty worktreePath and legacy seed path (raw.cwd) without git/existence validation.
  implication: Invalid persisted paths can propagate unchanged into diff requests after restarts/migrations.

- timestamp: 2026-03-01T22:55:46Z
  checked: packages/server/src/server/thread/thread-lifecycle.ts:275-295
  found: worktreePath is corrected only during switchThread when ensureThreadTerminal returns a different cwd; no equivalent healing occurs when merely listing threads or opening diff panel.
  implication: Stale worktreePath can persist indefinitely and repeatedly break diff panel for affected threads.

## Resolution

root_cause:
  Stale or non-git thread links.worktreePath values from registry are used directly as diff cwd. The diff request path (web -> session -> getCheckoutDiff) lacks git-path validation and fallback/rehydration, so requireGitRepo throws NotGitRepoError and blocks staged/unstaged plus rename rendering.
fix:
  Add daemon-side worktree path resolution/validation before diff subscription and heal stale thread worktreePath entries (fallback to validated terminal cwd or project repo-root discovered worktree), then continue snapshot computation.
verification:
files_changed: []
