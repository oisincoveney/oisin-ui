---
plan: 09-07
phase: 09-diff-panel-redesign
status: complete
files_modified:
  - packages/web/src/App.tsx
---

# 09-07 Summary: Wire updatedAt + Scroll Guard

## What Was Done

**updatedAt wired to DiffPanel:**
- Added `updatedAt={activeDiffEntry?.updatedAt ?? null}` to the `<DiffPanel>` render in App.tsx
- `activeDiffEntry.updatedAt` is set to `new Date().toISOString()` in `toCacheEntry` (diff-store.ts) on each snapshot
- DiffPanel now shows "Updated N ago" instead of "Waiting for diff snapshot"

**Scroll-to-bottom guard against disposed terminal:**
- Added `handleTerminalDispose` callback in App.tsx: calls `clearPendingScroll()` then sets `terminalRef.current = null`
- Wired as `onDispose` prop on `<TerminalView>`
- `terminal-view.tsx` calls `onDisposeRef.current?.()` in its cleanup — this fires before xterm disposal, clearing any pending scroll timer
- The existing `terminalRef.current?.scrollToBottom()` optional chain then safely no-ops if the timer somehow fires after disposal

## Result

DiffPanel shows correct timestamp after diff loads. No TypeError from stale scrollToBottom calls. TypeScript clean (0 errors).
