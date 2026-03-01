---
phase: 09
plan: 05
subsystem: diff-panel
tags: [diff, e2e, test, staged, unstaged, section-headers]
requires:
  - "09-03: staged/unstaged split in daemon + schema + web types"
provides:
  - e2e spec asserts Unstaged (N) section header visible after untracked file write
  - e2e spec asserts Staged (N) section header visible after git mv staged rename
affects:
  - "09-06+: UI section header rendering is now regression-covered"
tech-stack:
  added: []
  patterns:
    - Regex count-agnostic matchers (/^Staged \(\d+\)/) for section header assertions
key-files:
  created: []
  modified:
    - packages/server/e2e/diff-panel.spec.ts
decisions:
  - "Regex matchers used (/^Staged \(\d+\)/) so assertions are count-agnostic"
  - "Assertions inserted inline — no test restructuring"
metrics:
  duration: "<1 minute"
  completed: "2026-03-01"
---

# Phase 09 Plan 05: e2e Section Header Assertions Summary

**One-liner:** Added two count-agnostic regex assertions to `diff-panel.spec.ts` — `Unstaged (N)` after untracked file write and `Staged (N)` after `git mv` staged rename.

## What Was Built

### Task 1: Add section header assertions to e2e spec

Two new `expect` lines inserted at the appropriate points in the existing test flow:

**After `highlightedRowPath` is visible (untracked file write):**
```ts
// Untracked file appears in Unstaged section
await expect(panel.getByText(/^Unstaged \(\d+\)/)).toBeVisible({ timeout: 10_000 });
```

**After `renameLabel` is visible (git mv staged rename):**
```ts
// git mv stages the rename — it should appear in Staged section
await expect(panel.getByText(/^Staged \(\d+\)/)).toBeVisible({ timeout: 10_000 });
```

No existing assertions, selectors, or test structure changed.

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Regex matchers `/^Staged \(\d+\)/` | Count-agnostic — matches "Staged (1)", "Staged (2)", etc. without hardcoding count |
| Inline insertion only | Plan explicitly required no restructuring; minimal diff, easy to review |

## Verification

- `cd packages/server && bunx tsc --noEmit -p tsconfig.server.typecheck.json` → 0 errors ✓
- `git grep "Unstaged" packages/server/e2e/diff-panel.spec.ts` → matches ✓
- `git grep "Staged" packages/server/e2e/diff-panel.spec.ts` → matches ✓

## Commits

| Hash | Message |
|------|---------|
| `190efc3` | test(09-05): add section header assertions to diff-panel e2e spec |
