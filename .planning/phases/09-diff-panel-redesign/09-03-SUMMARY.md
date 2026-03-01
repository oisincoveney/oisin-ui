---
phase: 09
plan: 03
subsystem: diff-panel
tags: [diff, git, staged, unstaged, daemon, schema, types]
requires:
  - "09-01: DiffPanel commit bar + Changes collapsible + DiffFileSection tooltip/badges"
  - "09-02: diff-panel e2e spec audit"
provides:
  - getCheckoutDiff returns stagedFiles and unstagedFiles in uncommitted mode
  - checkout_diff_update payload carries stagedFiles and unstagedFiles arrays
  - DiffCacheEntry stores stagedFiles and unstagedFiles
affects:
  - "09-04+: UI can render two collapsible sections (Staged / Unstaged) from DiffCacheEntry"
tech-stack:
  added: []
  patterns:
    - Parallel Promise.all for staged/unstaged git operations
    - Optional fields with [] defaults for backward compat with older daemons
key-files:
  created: []
  modified:
    - packages/server/src/utils/checkout-git.ts
    - packages/server/src/shared/messages.ts
    - packages/server/src/server/session.ts
    - packages/web/src/diff/diff-types.ts
    - packages/web/src/diff/diff-store.ts
decisions:
  - "structured kept as union [...stagedFiles, ...unstagedFiles] for backward compat"
  - "stagedFiles/unstagedFiles optional in schema (older daemons won't send them)"
  - "web parseCheckoutDiffPayload defaults missing arrays to [] — safe for older daemons"
  - "getNumstatByPath replaces getTrackedNumstatByPath with variadic args (cleaner reuse)"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-01"
---

# Phase 09 Plan 03: Staged/Unstaged Split Summary

**One-liner:** Split `checkout_diff_update` payload into `stagedFiles`/`unstagedFiles` by running `git diff --cached` and `git diff` separately in the daemon, propagated through schema, session, and web diff-store.

## What Was Built

### Task 1: getCheckoutDiff staged/unstaged split (checkout-git.ts)

Added two new internal helpers:

- **`listStagedFileChanges(cwd)`** — runs `git diff --cached --name-status`, parses `CheckoutFileChange[]` (same logic as `listCheckoutFileChanges` but no untracked step)
- **`listUnstagedFileChanges(cwd)`** — runs `git diff --name-status` + `git ls-files --others --exclude-standard` for untracked files

Renamed `getTrackedNumstatByPath(cwd, ref)` → `getNumstatByPath(cwd, args[])` to support both `["HEAD"]`, `["--cached"]`, and `[]` (no ref = working tree vs index).

Updated `CheckoutDiffResult` type:
```ts
stagedFiles?: ParsedDiffFile[]
unstagedFiles?: ParsedDiffFile[]
```

In `getCheckoutDiff`, when `includeStructured: true` and `mode === "uncommitted"`:
- Runs `listStagedFileChanges` + `listUnstagedFileChanges` in parallel
- Runs staged numstat (`--cached`) + unstaged numstat (no ref) in parallel
- Builds each array through the same highlight/parse pipeline via inner `buildParsedFiles` helper
- Sets `structured = [...stagedFiles, ...unstagedFiles]` for backward compat
- Returns `{ diff, structured, stagedFiles, unstagedFiles }`

For `base` mode: unchanged — `stagedFiles`/`unstagedFiles` not set.

### Task 2: Schema, session, and web type propagation

**messages.ts:** Added optional fields to `CheckoutDiffSubscriptionPayloadSchema`:
```ts
stagedFiles: z.array(ParsedDiffFileSchema).optional()
unstagedFiles: z.array(ParsedDiffFileSchema).optional()
```

**session.ts (`computeCheckoutDiffSnapshot`):** Extracts `stagedFiles`/`unstagedFiles` from `diffResult` and includes them in the returned snapshot payload.

**diff-types.ts:** Added to `CheckoutDiffPayload` and `DiffCacheEntry`:
```ts
stagedFiles: ParsedDiffFile[]
unstagedFiles: ParsedDiffFile[]
```

**diff-store.ts:**
- `parseCheckoutDiffPayload`: reads `stagedFiles`/`unstagedFiles` from raw payload, defaults to `[]` if missing (older daemon compat)
- `toCacheEntry`: includes `stagedFiles`/`unstagedFiles` from payload into cache entry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing `eqeqeq` lint error in field.tsx**

- **Found during:** Task 2 commit (pre-commit hook ran oxlint)
- **Issue:** `uniqueErrors?.length == 1` used `==` instead of `===` in `packages/web/src/components/ui/field.tsx:180`
- **Fix:** Changed to `===`
- **Files modified:** `packages/web/src/components/ui/field.tsx`
- **Commit:** `24644da` (included in Task 2 commit)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep `structured` as union | Backward compat — existing consumers of `structured` (e.g. agent context) still work |
| Optional schema fields | Older daemons won't send `stagedFiles`/`unstagedFiles`; web defaults to `[]` |
| `getNumstatByPath` variadic | Cleaner than three separate functions; `["--cached"]`, `[]`, `["HEAD"]` all work |
| `buildParsedFiles` inner helper | Avoids duplicating the tracked+untracked pipeline for staged vs unstaged |

## Verification

- `cd packages/server && bunx tsc --noEmit -p tsconfig.server.typecheck.json` → 0 errors ✓
- `cd packages/web && bunx tsc --noEmit` → 0 errors ✓
- `git grep "stagedFiles" packages/server/src/utils/checkout-git.ts` → matches ✓
- `git grep "git diff --cached" packages/server/src/utils/checkout-git.ts` → matches ✓

## Commits

| Hash | Message |
|------|---------|
| `e271435` | feat(09-03): add staged/unstaged split to getCheckoutDiff |
| `24644da` | feat(09-03): propagate stagedFiles/unstagedFiles through schema, session, and web types |
