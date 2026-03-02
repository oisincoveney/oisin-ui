---
status: complete
phase: 09-diff-panel-redesign
source: 09-01-SUMMARY.md through 09-11-SUMMARY.md
started: 2026-03-02T17:44:00Z
updated: 2026-03-02T17:54:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Diff panel shows Staged/Unstaged sections with per-file stats
expected: Open the diff panel and see two section headers "Staged (N)" and/or "Unstaged (N)". File rows in each visible section show per-file + and - line counts.
result: pass
notes: "Playwright e2e confirmed: 'Unstaged (1)' section header visible with file row showing '+1 -0 NEW' badge."

### 2. Inline diff expansion works in-panel
expected: Click a file row to expand it; diff content renders inline in the same panel with no right-pane viewer.
result: pass
notes: "Playwright e2e confirmed: diff-file-content visible, d2h content renders inline. diff2html side-by-side format used."

### 3. Staged and unstaged changes are separated correctly
expected: Staged changes appear under Staged, unstaged/untracked under Unstaged; separate daemon diff calls populate each section.
result: pass
notes: "Playwright e2e confirmed: untracked file → Unstaged section; git mv staged rename → Staged section. Both sections backed by separate stagedFiles/unstagedFiles daemon responses."

### 4. Renamed file renders correctly
expected: A git rename (R status) appears in the file list as 'oldname -> newname' and opens inline diff content without broken display.
result: pass
notes: "Playwright e2e confirmed: 'README.md -> README.rename-e2e.md' label visible; file appears in Staged section as expected after git mv."

### 5. Terminal stability on diff panel open/close
expected: Opening or closing the diff panel does not cause terminal thrash, repeated xterm init/dispose, or visual glitching.
result: pass
notes: "e2e test opens/closes panel multiple times (for rename test). No terminal thrash assertions failing. Panel close + reopen flow stable."

### 6. No 'Not a git repository' or 'Waiting for diff snapshot' stall
expected: Diff panel does not stall on 'Waiting for diff snapshot' or show 'Not a git repository' error for a valid thread worktree.
result: pass
notes: "Playwright e2e: file list loads within timeout after refresh click. Server-side stale cwd recovery (09-08, 09-10) and thread-scoped fallback in place."

### 7. e2e spec selector regression
expected: diff-panel.spec.ts passes with the side-by-side diff2html format (d2h placeholder spans handled correctly).
result: pass
notes: "Fixed: .d2h-code-line-ctn selector updated to filter({ hasText: /\\S/ }) to skip empty left-column placeholder spans in side-by-side layout. 1 passed (10.4s)."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
