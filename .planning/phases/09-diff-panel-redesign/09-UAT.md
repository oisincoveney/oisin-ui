---
status: diagnosed
phase: 09-diff-panel-redesign
source: 09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md, 09-05-SUMMARY.md
started: 2026-03-01T22:41:00Z
updated: 2026-03-01T22:52:42Z
---

## Current Test

[testing complete]

## Tests

### 1. Diff panel shows split sections and file stats
expected: Open the diff panel and you see two section headers, "Staged (N)" and/or "Unstaged (N)", based on available changes. File rows in each visible section show per-file + and - counts.
result: issue
reported: "Diff panel keeps opening/closing repeatedly; unstable to use."
severity: blocker

### 2. Inline diff expansion works in-panel
expected: Expanding a section and opening a file renders that file diff inline in the same panel, with no separate right-side diff viewer.
result: issue
reported: "Diff panel never reaches staged/unstaged file rows; panel stalls at 'Waiting for diff snapshot' and throws runtime terminal error in console."
severity: blocker

### 3. Staged and unstaged changes are separated correctly
expected: Staged changes appear under Staged and unstaged/untracked changes appear under Unstaged; counts and file placement update after refresh.
result: issue
reported: "Diff view reports 'Not a git repository' for selected threads, so staged/unstaged separation cannot render."
severity: blocker

### 4. Renamed file renders with correct label
expected: A git rename appears in the file list with a clear old->new path style and opens inline diff content without broken text.
result: issue
reported: "Rename flow untestable because diff panel never provides file list in this session (snapshot stuck + not-a-git-repo state)."
severity: major

## Summary

total: 4
passed: 0
issues: 4
pending: 0
skipped: 0

## Gaps

- truth: "Open the diff panel and see stable Staged/Unstaged sections with per-file stats."
  status: failed
  reason: "User reported: when diff panel is opened the screen goes nuts due to overflow behavior; closing the panel stops it."
  severity: blocker
  test: 1
  root_cause: "TerminalView re-initializes repeatedly under diff-panel-open rerenders because App passes unstable callback props and conditionally mounts different TerminalView branches; repeated xterm+webgl init/dispose triggers visual thrash and overflow-like jitter."
  artifacts:
    - path: "packages/web/src/App.tsx"
      issue: "Non-memoized terminal callbacks and two conditional TerminalView branches remount terminal when diff panel layout changes."
    - path: "packages/web/src/terminal/terminal-view.tsx"
      issue: "Terminal init effect depends on callback prop identity, recreating xterm/webgl frequently."
  missing:
    - "Memoize onTerminalReady/onResize handlers in App with stable references."
    - "Keep a single TerminalView mount path across diff-panel open/close states to avoid xterm disposal churn."
    - "Decouple terminal init effect from callback identity changes or bridge callbacks through refs in TerminalView."
  debug_session: ".planning/debug/phase-09-uat-gap-1-overflow.md"

- truth: "Expanding a section and opening a file renders inline diff content in the panel."
  status: failed
  reason: "Observed in manual UAT: panel remains on waiting state and console reports TypeError in App.tsx terminal scroll path."
  severity: blocker
  test: 2
  root_cause: "Delayed terminal scroll executes against a disposed xterm instance during terminal remount churn; App also fails to pass updatedAt into DiffPanel so UI keeps 'Waiting for diff snapshot' even after snapshot state updates."
  artifacts:
    - path: "packages/web/src/App.tsx"
      issue: "scheduleScrollToBottom calls scrollToBottom on stale terminal ref; updatedAt not passed to DiffPanel."
    - path: "packages/web/src/terminal/terminal-view.tsx"
      issue: "Unmount/dispose timing creates stale terminal windows under rapid remounts."
    - path: "packages/web/src/components/diff-panel.tsx"
      issue: "Waiting label depends on updatedAt prop that is not wired from App."
  missing:
    - "Guard and cancel delayed scroll-to-bottom on terminal disposal/swap before invoking xterm APIs."
    - "Pass updatedAt={activeDiffEntry?.updatedAt ?? null} from App into DiffPanel."
    - "After terminal lifecycle stabilization, verify inline file open keeps panel responsive."
  debug_session: ".planning/debug/phase-09-uat-gap-2-waiting-runtime.md"

- truth: "Staged and unstaged changes are shown in separate sections and update with refresh."
  status: failed
  reason: "Observed in manual UAT: diff requests resolve to 'Not a git repository' for active thread worktree path."
  severity: blocker
  test: 3
  root_cause: "Diff subscribe path trusts persisted thread worktreePath as cwd without validating git repo existence; stale/non-repo worktree paths hard-fail in daemon requireGitRepo and prevent diff payload rendering."
  artifacts:
    - path: "packages/web/src/thread/thread-store.ts"
      issue: "Diff target cwd prefers active thread worktreePath even when stale."
    - path: "packages/web/src/diff/diff-store.ts"
      issue: "subscribe_checkout_diff_request forwards cwd directly."
    - path: "packages/server/src/server/session.ts"
      issue: "Diff request handler forwards cwd to checkout diff without stale-path recovery."
    - path: "packages/server/src/utils/checkout-git.ts"
      issue: "requireGitRepo throws hard error on invalid cwd, surfacing not-a-repo message."
  missing:
    - "Validate/recover diff cwd server-side when request cwd is not a git repo."
    - "Fallback to resolved active project/worktree path and continue returning structured diff data."
    - "Write back healed worktreePath for thread metadata to avoid repeated stale-path failures."
  debug_session: ".planning/debug/phase-09-uat-gap-3-stale-worktree.md"

- truth: "Renamed files display correctly and open inline diff content."
  status: failed
  reason: "Blocked by missing diff file list in manual UAT session (waiting snapshot/not-a-git-repo states)."
  severity: major
  test: 4
  root_cause: "Rename rendering path could not be exercised because upstream diff hydration fails under stale worktree cwd and unstable panel runtime; this is a dependency failure, not an isolated rename formatter bug yet."
  artifacts:
    - path: "packages/web/src/components/diff-panel.tsx"
      issue: "Rename row rendering unverified due absent diff rows in failing runtime state."
    - path: "packages/web/src/components/diff-file-section.tsx"
      issue: "Rename label UI cannot be validated until diff payload loads."
  missing:
    - "Close gap #3 and rerun manual rename scenario with real staged rename fixture."
    - "Add/refresh e2e assertion for renamed file label and inline open flow once runtime path is fixed."
  debug_session: ".planning/debug/phase-09-uat-gap-4-rename-blocked.md"
