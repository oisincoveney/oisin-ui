---
plan: 09-06
phase: 09-diff-panel-redesign
status: complete
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/diff-panel.tsx
---

# 09-06 Summary: TerminalView Lifecycle Stabilization

## What Was Done

**App.tsx:**
- Kept a single always-mounted `<TerminalView>` in one panel tree
- Stabilized `onTerminalReady` and `onDispose` with `useCallback` so `terminal-view.tsx` init effect does not re-run from callback identity churn
- Fixed panel sizing contract for `react-resizable-panels` by using percentage values (`"40%"`, `"30%"`, `"60%"`, `${diffPanelWidth}%`)
- Locked viewport height with `h-dvh` on app root container and `min-h-0` guards on resizable panels

**DiffPanel layout:**
- Added `min-h-0` + `w-full` on panel root and `min-h-0 flex-1` on `ScrollArea` to prevent internal content from shrinking panel width or forcing overflow

## Result

Terminal stays mounted and responsive while toggling diff panel, layout height remains stable (`720 -> 720` in browser verification), and panel width no longer collapses to ~40px.
