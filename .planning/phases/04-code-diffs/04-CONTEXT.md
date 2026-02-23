# Phase 4: Code Diffs - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users review uncommitted code changes per thread in-browser with syntax-highlighted diffs. This phase covers diff panel layout and diff presentation behavior only. No new capabilities beyond DIFF-01.

</domain>

<decisions>
## Implementation Decisions

### Panel layout
- Desktop layout: diff panel on the right of terminal (side-by-side).
- Default state on thread open: closed.
- Panel width: resizable, persisted globally across app.
- Width bounds: min 30%, max 60%.
- On thread switch: always close diff panel.
- Open/close affordance: header toggle button.
- Keyboard toggle: none for now.
- On open: keep keyboard focus in terminal.
- Mobile: full-screen diff sheet with top-left back close pattern.
- Visual system: use ShadCN sheet/split patterns.

### Diff organization
- File ordering: git diff order.
- File expansion default: all collapsed.
- File row metadata: path + added/removed line counts.
- Hunk context default: 3 unchanged lines.
- Renames: single row with `old/path -> new/path`.
- Binary/non-text files: summary row only (no hunk rendering).
- Large-file behavior: show first N hunks, allow explicit expand.
- Filters/search: none for v1.

### Component sourcing policy (locked)
- Use ShadCN components only.
- Do not hand-roll custom UI components for this phase.
- If base set lacks a needed component, use online registries/components that can be registered and used within the ShadCN ecosystem.

### OpenCode's Discretion
- Exact value of large-diff "N hunks" threshold.
- Exact visual styling details within existing ShadCN/tailwind tokens.
- Exact wording for binary/large-diff helper text.

</decisions>

<specifics>
## Specific Ideas

- Keep review workflow terminal-first by default (diff starts closed, explicit open).
- Keep UI composition strictly inside ShadCN component patterns and sourced components.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-code-diffs*
*Context gathered: 2026-02-23*
