# Phase 09: Diff Panel Redesign - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current flat diff panel with a redesigned sidebar panel. The panel
slides in from the right and pushes the terminal. It shows staged and unstaged
changes in two sections. Clicking a file expands its diff inline. A commit
message input and Push button sit at the top. Hunk-level staging and actual
commit logic are Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Panel structure
- Commit message input + Push button at the TOP of the panel
- Two sections below: "Staged" then "Unstaged", each with their file rows
- Clicking a file expands its diff inline below that row (GitHub PR style)
- No separate diff viewer page or route

### Panel behaviour
- Slides in from the right
- Pushes/shrinks the terminal — both terminal and panel visible simultaneously
- Resizable by the user (drag to resize)

### File list rows
- Show: filename + colour-coded +/- counts (green additions, red deletions)
- Long paths: truncate the start, show filename at end, full path in tooltip
- Selected/active file: background highlight
- Renamed files: displayed as `old → new`
- New (untracked) files: small "new" badge or dot indicator
- Deleted files: visual indicator (strikethrough or red dot)
- Files sorted alphabetically within each section

### Sections
- Section headers: "Staged" and "Unstaged" with file count, e.g. "Staged (2)"
- Sections are collapsible
- Empty section: hide entirely
- Empty state (no changes at all): simple "No changes" text

### Inline diff expansion
- Files start: all expanded if few files, collapsed if many
  (threshold at OpenCode's discretion)
- Diff renders inline below the file row, GitHub PR diff style

### OpenCode's Discretion
- Exact collapse threshold (few vs many files)
- Empty section animation/transition
- Resizable panel implementation (drag handle, min/max width)
- Exact badge/indicator styling for new and deleted files

</decisions>

<specifics>
## Specific Ideas

- Reference: Superset.sh "Review Changes" panel — commit bar at top, file list below
- Diff rendering within the panel: GitHub PR inline diff style
- The panel should feel like a natural extension of the sidebar, not a modal

</specifics>

<deferred>
## Deferred Ideas

- Hunk-level "Stage hunk" / "Unstage hunk" buttons — Phase 10
- Actual commit logic wired to git — Phase 10
- "Against Main" comparison view — noted for potential Phase 11
- Side-by-side diff toggle — potential future phase

</deferred>

---

*Phase: 09-diff-panel-redesign*
*Context gathered: 2026-02-28*
