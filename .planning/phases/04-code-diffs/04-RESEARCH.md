# Phase 4: Code Diffs - Research

**Researched:** 2026-02-23
**Domain:** Web diff rendering for per-thread uncommitted git changes (Paseo server + web client)
**Confidence:** HIGH

## Summary

Phase 4 should build on existing server-side checkout diff subscriptions, not invent new diff backends. The daemon already computes structured diffs (`files[]` with hunks, per-line tokens, binary/too-large statuses) and already pushes realtime updates via `subscribe_checkout_diff_request` / `checkout_diff_update`. The missing work is mainly web integration, per-thread subscription lifecycle, and UI composition that matches locked phase decisions.

For rendering, use `diff2html` as the rendering engine and keep UI shells in ShadCN primitives (`Resizable`, `Sheet`, `Collapsible`, `ScrollArea`, `Button`, `Separator`). Use the existing external-store pattern (`useSyncExternalStore`) for diff state and keep websocket lifecycle outside React components (already a locked decision and consistent with `thread-store` + `ws` architecture).

Two codebase-specific risks must shape planning: (1) current server snapshot path sorting is alphabetical, but phase decision requires git diff order; (2) thread payloads currently do not expose `worktreePath`, so per-thread diff isolation needs either payload extension or a deterministic mapping strategy. Treat both as first-class tasks, not polish.

**Primary recommendation:** Implement a dedicated `diff-store` external store keyed by active thread, backed by server checkout-diff subscriptions, and render file-level diffs lazily with `diff2html` inside ShadCN `Collapsible` sections.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `diff2html` | `3.4.56` | Diff rendering engine (side-by-side, file metadata, large-diff controls) | Officially supports unified/git diffs + JSON `DiffFile[]` input, widely used and maintained |
| `react-resizable-panels` (via ShadCN `Resizable`) | `4.6.5` | Desktop right-panel resize with bounded persistent sizing | Already the underlying ShadCN standard for accessible split layouts |
| ShadCN + Radix primitives (`sheet`, `collapsible`, `separator`, `scroll-area`) | existing in repo; add `resizable` component | Required UI composition system for this phase | Locked phase decision: no hand-rolled components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `highlight.js` | `11.11.1` | Syntax highlight runtime used by diff2html UI paths | Use when enabling diff2html highlight option or UI helper |
| Existing server diff pipeline (`getCheckoutDiff`, checkout diff subscriptions) | in-repo | Structured diff computation + live updates | Always; do not replace with browser-side git parsing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `diff2html` | `react-diff-viewer-continued` or custom renderers | Loses direct alignment with phase requirement (`diff2html integration`) and existing server diff semantics |
| ShadCN `Resizable` | CSS drag splitter | Violates locked “ShadCN only” component policy and reduces keyboard/accessibility quality |
| Server push subscriptions | Client polling (`setInterval` + request/response) | Higher load, worse freshness, duplicates server-side watcher/fallback logic already implemented |

**Installation:**
```bash
bun add --cwd packages/web diff2html highlight.js react-resizable-panels
bunx --bun shadcn@latest add resizable
```

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
├── diff/                    # Diff domain logic and rendering adapters
│   ├── diff-store.ts        # external store + ws subscription lifecycle
│   ├── diff2html-adapter.ts # ParsedDiffFile -> DiffFile mapping
│   └── diff-types.ts        # local typed payload/state contracts
├── components/
│   ├── diff-panel.tsx       # desktop right panel
│   ├── diff-mobile-sheet.tsx# mobile full-screen sheet
│   └── diff-file-section.tsx# per-file collapsible section
└── App.tsx                  # compose terminal + diff panel layout
```

### Pattern 1: External Diff Store (Thread-Scoped)
**What:** A `useSyncExternalStore`-based store that owns diff subscription IDs, refresh state, and payload cache keyed by thread key (`projectId:threadId`).
**When to use:** Always for DIFF-01; this preserves existing architectural rule: websocket lifecycle outside components.
**Example:**
```typescript
// Source: repo pattern in packages/web/src/thread/thread-store.ts
import { useSyncExternalStore } from 'react'

type DiffState = {
  byThreadKey: Record<string, { files: ParsedDiffFile[]; error: string | null }>
  open: boolean
  widthPercent: number
}

export function useDiffSnapshot(): DiffState {
  return useSyncExternalStore(subscribeDiffStore, getDiffSnapshot, getDiffSnapshot)
}
```

### Pattern 2: Server-Driven Subscription + Client On-Demand Refresh
**What:** Subscribe once for active thread cwd, process `subscribe_checkout_diff_response` + `checkout_diff_update`, and trigger manual refresh by re-subscribing same thread/cwd.
**When to use:** Realtime updates and explicit refresh button/gesture.
**Example:**
```typescript
// Source: packages/server/src/shared/messages.ts and session.ts
sendWsMessage({
  type: 'subscribe_checkout_diff_request',
  subscriptionId,
  cwd,
  compare: { mode: 'uncommitted' },
  requestId,
})
```

### Pattern 3: Lazy Per-File Diff Rendering
**What:** Default all file sections collapsed; only convert/render diff HTML for expanded files. Keep metadata rows always visible.
**When to use:** Always (phase-locked default collapsed + better perf for large diffs).
**Example:**
```typescript
// Source: diff2html API docs (README)
import { html as diffToHtml } from 'diff2html'

const fileHtml = diffToHtml([singleFileDiff], {
  outputFormat: 'side-by-side',
  drawFileList: false,
  matching: 'none',
})
```

### Anti-Patterns to Avoid
- **Global singleton subscription not keyed by thread:** leaks updates across thread switches; violates thread isolation.
- **Render all file hunks eagerly:** expensive on large dirty worktrees; creates avoidable UI jank.
- **Rely on alphabetical client sorting:** conflicts with locked decision requiring git diff order.
- **Hand-built split panel/sheet/collapsible widgets:** violates locked ShadCN-only policy.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Side-by-side diff DOM + intraline highlighting | Custom React diff renderer | `diff2html` | Handles matching/highlight rules and edge cases already |
| Drag-resize split layout | Mousemove listeners + custom math | ShadCN `Resizable` (`react-resizable-panels`) | Accessibility, keyboard behavior, persistence support |
| Mobile fullscreen overlay + dismissal semantics | Custom absolute/fixed panel | ShadCN `Sheet` | Correct focus/portal/escape behavior out of box |
| File section collapse state machine | Manual open/close DOM toggles | ShadCN `Collapsible` | Controlled/uncontrolled API + predictable accessibility |

**Key insight:** In this phase, leverage server diff computation + proven render/layout primitives; custom implementations mainly add bugs without adding product value.

## Common Pitfalls

### Pitfall 1: Wrong File Order (Current Code Mismatch)
**What goes wrong:** UI shows alphabetical file order instead of git diff order.
**Why it happens:** `getCheckoutDiff` and `computeCheckoutDiffSnapshot` currently sort paths (`a.path < b.path`).
**How to avoid:** Remove/guard sorting for DIFF-01 path; preserve command output order from git.
**Warning signs:** File list order differs from `git diff --name-status` output.

### Pitfall 2: Missing Thread->CWD Mapping
**What goes wrong:** Diff panel shows wrong repo/worktree changes after thread switch.
**Why it happens:** `ThreadSummary` sent to web currently lacks `worktreePath`; only `project.repoRoot` is available.
**How to avoid:** Extend thread summary payload with `worktreePath` (or equivalent cwd) and use that for subscriptions.
**Warning signs:** Two threads under same project show identical diffs despite different worktrees.

### Pitfall 3: Subscription Leaks on Thread Switch
**What goes wrong:** Old thread updates keep mutating visible panel.
**Why it happens:** Previous `subscriptionId` not unsubscribed when active thread changes / panel closes.
**How to avoid:** On switch, close panel (locked), unsubscribe old ID, clear pending request correlation.
**Warning signs:** `checkout_diff_update` payloads arrive for inactive thread key.

### Pitfall 4: Large Diff UI Freeze
**What goes wrong:** Browser stalls opening large changed files.
**Why it happens:** Eager render + expensive line matching/highlighting.
**How to avoid:** Render first `N` hunks only (phase lock), set `matching: 'none'` for heavy files, lazy render on expand.
**Warning signs:** Long frame drops on first panel open or file expansion.

### Pitfall 5: Test Instability from Environment Constraints
**What goes wrong:** False negatives from full-repo typecheck OOM or flaky e2e startup.
**Why it happens:** Known shell/runtime constraints from prior phases.
**How to avoid:** Gate with workspace-level checks (`packages/web`, `packages/server`) and deterministic e2e cases with explicit waits.
**Warning signs:** Non-deterministic failures unrelated to diff logic.

## Code Examples

Verified patterns from official sources:

### Subscribe to checkout diffs (server contract)
```typescript
// Source: packages/server/src/shared/messages.ts
{
  type: 'subscribe_checkout_diff_request',
  subscriptionId: 'thread:projA:threadB',
  cwd: '/repo/.paseo/worktrees/threadB',
  compare: { mode: 'uncommitted' },
  requestId: 'req-123'
}
```

### diff2html with side-by-side output
```typescript
// Source: https://github.com/rtfpessoa/diff2html/blob/master/README.md
import { html as diffToHtml } from 'diff2html'

const html = diffToHtml(diffInput, {
  outputFormat: 'side-by-side',
  drawFileList: false,
  matching: 'lines',
})
```

### ShadCN resizable layout shell
```typescript
// Source: https://ui.shadcn.com/docs/components/resizable
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel defaultSize={60}>terminal</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel minSize={30} maxSize={60} defaultSize={40}>diff</ResizablePanel>
</ResizablePanelGroup>
```

### ShadCN controlled collapsible file section
```typescript
// Source: https://ui.shadcn.com/docs/components/collapsible
<Collapsible open={open} onOpenChange={setOpen}>
  <CollapsibleTrigger>path/to/file.ts +10 -2</CollapsibleTrigger>
  <CollapsibleContent>{/* lazy diff render */}</CollapsibleContent>
</Collapsible>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling git diff from client loops | Server push via checkout diff subscriptions + fs watch fallback | Already in current server (`session.ts`) | Lower client complexity, realtime updates, fewer races |
| Custom splitter components | ShadCN `Resizable` backed by `react-resizable-panels` v4 | ShadCN docs update (2025-02 v4 note) | Better accessibility + stable API surface |
| Per-file subprocess fanout patterns for huge diffs | Structured diff + binary/too-large placeholders in `checkout-git.ts` | Current implementation | Better bounded behavior on pathological repos |

**Deprecated/outdated:**
- Browser-only diff parsing for this phase: outdated in this codebase because server already computes normalized diff payloads.

## Open Questions

1. **Thread cwd source for DIFF-01**
   - What we know: `ThreadSummary` lacks `worktreePath`; server thread records already have `thread.links.worktreePath`.
   - What's unclear: whether to expose this in existing thread messages or add dedicated lookup request.
   - Recommendation: extend `ThreadSummarySchema` + `toThreadSummary()` with nullable `worktreePath` and use it as diff cwd.

2. **Large-file explicit expand behavior when server marks `too_large`**
   - What we know: server may omit hunks entirely (`status: too_large`) based on thresholds.
   - What's unclear: whether product expects expand to bypass those backend limits.
   - Recommendation: v1 keep summary-only for `too_large`; implement first-`N` hunk behavior only for files with available hunks.

## Sources

### Primary (HIGH confidence)
- Repo source: `packages/server/src/utils/checkout-git.ts` - diff computation, binary/large-file handling, structured output.
- Repo source: `packages/server/src/server/session.ts` - checkout diff subscription lifecycle, watch + fallback refresh.
- Repo source: `packages/server/src/shared/messages.ts` - websocket message contracts and diff payload schema.
- Official docs: https://github.com/rtfpessoa/diff2html/blob/master/README.md - API/config for `diff2html` and UI options.
- Official package metadata: https://registry.npmjs.org/diff2html/latest - current release/version details.
- Official docs: https://ui.shadcn.com/docs/components/resizable - ShadCN resizable pattern and v4 note.
- Official package metadata: https://registry.npmjs.org/react-resizable-panels/latest - underlying splitter version.

### Secondary (MEDIUM confidence)
- Official project site: https://diff2html.xyz/ - feature/usage confirmation.
- Official package metadata: https://registry.npmjs.org/highlight.js/latest - highlight runtime version.

### Tertiary (LOW confidence)
- None (Google search tool unavailable in this environment; no unverified community sources used).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on official package metadata + existing repo constraints.
- Architecture: HIGH - based on in-repo websocket/store patterns and message contracts.
- Pitfalls: HIGH - directly observed in current implementation (sorting, missing thread cwd field, subscription lifecycle risks).

**Research date:** 2026-02-23
**Valid until:** 2026-03-25 (30 days)
