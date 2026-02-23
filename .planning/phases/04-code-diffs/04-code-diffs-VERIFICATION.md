---
phase: 04-code-diffs
verified: 2026-02-23T22:40:18Z
status: passed
score: 15/15 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 10/15
  gaps_closed:
    - "File rows in the diff UI appear in the same order users see from git diff output."
    - "Revisiting a thread after switching still shows that thread's own diff files in stable git-order sequence."
    - "Diff panel shows per-file uncommitted changes with syntax-highlighted code."
    - "Files appear in git diff order and are collapsed by default with path plus +/- counts."
    - "Rename, binary, and too-large file states render explicit summary rows without broken hunk UI."
  gaps_remaining: []
  regressions: []
---

# Phase 4: Code Diffs Verification Report

**Phase Goal:** Users can review uncommitted code changes per thread without leaving the browser.
**Verified:** 2026-02-23T22:40:18Z
**Status:** passed
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Switching between threads shows each thread's own uncommitted changes instead of leaking changes from another thread. | ✓ VERIFIED | `packages/web/src/diff/diff-store.ts:143` gates by active `subscriptionId`; `packages/web/src/diff/diff-store.ts:282` unsubscribes previous subscription on switch. |
| 2 | File rows in the diff UI appear in the same order users see from git diff output. | ✓ VERIFIED | `packages/server/src/server/session.ts:4081` copies `diffResult.structured` with no sort; prior `files.sort` gap removed. |
| 3 | Revisiting a thread after switching still shows that thread's own diff files in stable git-order sequence. | ✓ VERIFIED | `packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts:158` re-subscribe assertion expects same git-derived order after updates. |
| 4 | When users switch active threads, the diff view updates to that thread's changes and stops showing updates from the previous thread. | ✓ VERIFIED | `packages/web/src/diff/diff-store.ts:272` resets active target/subscription and resubscribes only for new target. |
| 5 | Live diff updates remain correct after thread switches, page activity, and websocket reconnect paths. | ✓ VERIFIED | `packages/web/src/diff/diff-store.ts:197` reconnect hook re-subscribes active target on `connected`. |
| 6 | Users can manually refresh the current thread diff snapshot without reloading the app. | ✓ VERIFIED | `packages/web/src/diff/diff-store.ts:304` implements refresh; wired from header/panel controls in `packages/web/src/App.tsx:489` and `packages/web/src/App.tsx:538`. |
| 7 | Desktop shows a right-side diff panel that is closed by default and toggled from header controls. | ✓ VERIFIED | Default closed in `packages/web/src/diff/diff-store.ts:34`; toggle wiring in `packages/web/src/App.tsx:96`. |
| 8 | Diff panel width is resizable within 30-60% bounds and persisted globally across sessions. | ✓ VERIFIED | Width clamp in `packages/web/src/diff/diff-store.ts:267`; localStorage hydrate/persist in `packages/web/src/App.tsx:213` and `packages/web/src/App.tsx:229`. |
| 9 | Switching threads always closes the diff panel. | ✓ VERIFIED | `packages/web/src/App.tsx:236` closes on active-thread key change; `packages/web/src/diff/diff-store.ts:295` also closes during target switch. |
| 10 | Mobile uses a full-screen diff sheet with top-left back/close affordance. | ✓ VERIFIED | Full-screen sheet in `packages/web/src/components/diff-mobile-sheet.tsx:56`; top-left back `SheetClose` in `packages/web/src/components/diff-mobile-sheet.tsx:61`. |
| 11 | Diff panel shows per-file uncommitted changes with syntax-highlighted code. | ✓ VERIFIED | Adapter now derives language by extension (`packages/web/src/diff/diff2html-adapter.ts:235`) and e2e asserts highlight classes (`packages/web/e2e/diff-panel.spec.ts:45`). |
| 12 | Files appear in git diff order and are collapsed by default with path plus +/- counts. | ✓ VERIFIED | Server preserves order (`packages/server/src/server/session.ts:4081`); collapsed default/open state and +/- row metadata in `packages/web/src/components/diff-file-section.tsx:32` and `packages/web/src/components/diff-file-section.tsx:74`. |
| 13 | Rename, binary, and too-large file states render explicit summary rows without broken hunk UI. | ✓ VERIFIED | `oldPath` is explicit in schema (`packages/server/src/shared/messages.ts:866`) and propagation (`packages/server/src/utils/checkout-git.ts:1212`); summary-only rendering for `binary`/`too_large` in `packages/web/src/components/diff-file-section.tsx:91`. |
| 14 | Panel supports manual refresh and updates reflect new terminal edits for the active thread. | ✓ VERIFIED | Refresh request path is wired (`packages/web/src/diff/diff-store.ts:304`) and e2e issues terminal edits then refresh asserts updated rows (`packages/web/e2e/diff-panel.spec.ts:29`). |
| 15 | Diff surfaces are read-only (no inline editing) and terminal remains the primary place where users make code changes. | ✓ VERIFIED | UI renders review-only content; e2e asserts absence of edit controls (`packages/web/e2e/diff-panel.spec.ts:66`). |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/server/src/server/session.ts` | Checkout diff snapshot generation preserves upstream structured order | ✓ VERIFIED | Exists/substantive (~7k lines); `computeCheckoutDiffSnapshot()` forwards `structured` directly; no post-sort. |
| `packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts` | Regression for non-alphabetic order in subscribe/update/re-subscribe | ✓ VERIFIED | Exists/substantive (215 lines); asserts git-derived non-alphabetic order for initial/update/revisit payloads. |
| `packages/server/src/shared/messages.ts` | ParsedDiffFile contract exposes explicit rename metadata | ✓ VERIFIED | Exists/substantive; `ParsedDiffFileSchema` includes optional `oldPath`. |
| `packages/server/src/utils/checkout-git.ts` | Structured diff assembly propagates rename metadata + placeholder states | ✓ VERIFIED | Exists/substantive; rename `oldPath` carried in parsed, fallback, and placeholder entries. |
| `packages/server/src/server/utils/diff-highlighter.ts` | Parsed diff type supports rename metadata | ✓ VERIFIED | Exists/substantive; `ParsedDiffFile` interface includes optional `oldPath`. |
| `packages/web/src/diff/diff-types.ts` | Web typed payload mirrors shared rename metadata | ✓ VERIFIED | Exists/substantive; `ParsedDiffFile.oldPath?: string` is defined and consumed by UI. |
| `packages/web/src/diff/diff2html-adapter.ts` | Deterministic rename display + extension-aware syntax highlight path | ✓ VERIFIED | Exists/substantive; `getDiffFileDisplayPath()` prefers structured rename metadata and language derives from target path. |
| `packages/web/src/components/diff-file-section.tsx` | Collapsed-by-default per-file renderer with rename/binary/large handling | ✓ VERIFIED | Exists/substantive; default collapsed, deterministic display path, summary-only rows for binary/too_large. |
| `packages/web/e2e/diff-panel.spec.ts` | Regression checks for highlight classes + rename labels | ✓ VERIFIED | Exists/substantive; asserts `.hljs-*` markup and `old -> new` rename label visibility. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/server/src/utils/checkout-git.ts` | `packages/server/src/server/session.ts` | `getCheckoutDiff(...includeStructured)` -> `computeCheckoutDiffSnapshot()` | ✓ WIRED | `session.ts` emits copied `structured` order without normalization. |
| `packages/server/src/server/session.ts` | `packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts` | subscribe/update payload order assertions | ✓ WIRED | E2E computes expected git order and asserts payload order parity in initial/update/revisit flows. |
| `packages/server/src/utils/checkout-git.ts` | `packages/server/src/shared/messages.ts` | structured parsed files include optional `oldPath` matching schema | ✓ WIRED | `oldPath` propagated from `--name-status` parse and accepted by shared schema. |
| `packages/server/src/shared/messages.ts` | `packages/web/src/diff/diff-types.ts` | shared contract extension mirrored in web types | ✓ WIRED | Both define optional `oldPath` on parsed files. |
| `packages/web/src/diff/diff2html-adapter.ts` | `packages/web/src/components/diff-file-section.tsx` | `getDiffFileDisplayPath()` + `toDiff2Html()` rendering | ✓ WIRED | File section uses adapter for rename labels and rendered html output. |
| `packages/web/src/thread/thread-store.ts` | `packages/web/src/diff/diff-store.ts` | active thread diff target -> `setActiveDiffThread()` | ✓ WIRED | Main bootstrap syncs thread target into diff store (`packages/web/src/main.tsx:19`). |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| DIFF-01: User can view uncommitted code changes per thread with syntax highlighting | ✓ SATISFIED | None. Previous ordering, rename metadata, and highlight-path blockers are closed. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/web/e2e/diff-panel.spec.ts` | 21 | `test.skip(...)` when no active thread exists | ⚠️ Warning | Regression can be bypassed in empty test fixtures; not a production behavior blocker. |

### Gaps Summary

All previously failed truths are now closed. Re-verification found no missing/stub/orphaned must-have artifacts and no broken key links blocking the phase goal.

---

_Verified: 2026-02-23T22:40:18Z_
_Verifier: OpenCode (gsd-verifier)_
