---
plan: 09-06
phase: 09-diff-panel-redesign
status: complete
files_modified:
  - packages/web/src/terminal/terminal-view.tsx
  - packages/web/src/App.tsx
---

# 09-06 Summary: TerminalView Lifecycle Stabilization

## What Was Done

**terminal-view.tsx:**
- Added `onTerminalReadyRef` and `onDisposeRef` refs that mirror the callback props
- Two lightweight `useEffect` calls sync the refs on each render
- Init effect now uses `onTerminalReadyRef.current` and `onDisposeRef.current` instead of props directly
- Dep array changed from `[onTerminalReady, onDispose]` → `[]` — runs once on mount

**App.tsx:**
- Removed dual-branch conditional JSX (`!isMobile && diffPanelOpen ? <ResizablePanelGroup>...<TerminalView /> : <TerminalView />`)
- Replaced with single always-mounted `<ResizablePanelGroup>` containing a single `<TerminalView>`
- Diff panel (`<ResizablePanel>` + `<ResizableHandle>`) conditionally rendered alongside the terminal panel
- TerminalView never unmounts on diff panel toggle

## Result

TerminalView mounts once per App lifecycle. Opening/closing the diff panel no longer triggers xterm dispose/reinit. TypeScript clean (0 errors).
