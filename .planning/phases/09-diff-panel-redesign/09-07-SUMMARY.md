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

**Active thread terminal identity recovery:**
- Restored `activeThreadTerminalId = activeThread?.terminalId ?? null` so closed threads can still attach/replay stream history
- When active thread exists but terminal id is temporarily missing, app now calls `ensureDefaultTerminal()` instead of clearing terminal state
- This prevents blank terminal state during thread transitions and new-thread bootstrap windows

## Result

DiffPanel timestamp renders correctly and active thread terminal no longer drops to blank during active-thread terminal-id gaps.
