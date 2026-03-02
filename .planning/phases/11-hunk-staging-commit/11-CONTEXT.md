# Phase 11: Hunk Staging & Commit - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

File-level stage/unstage with commit. Users can move individual files between Staged and Unstaged sections and commit what's staged — like a standard git tool (VS Code source control, GitKraken). No hunk-level or patch-level staging.

</domain>

<decisions>
## Implementation Decisions

### Stage/Unstage Interaction
- Stage/Unstage button lives inside the existing accordion file header bar (same row as file name, +/- stats, expand toggle)
- Button style: small ghost/outline button with an icon (not text-only, not icon-only with no affordance)
- When a file is staged/unstaged, it collapses and moves to the other section (does not preserve expand state across sections)

### Commit Bar Behaviour
- Commit button disabled until commit message input is non-empty
- After successful commit: input clears
- On commit failure: toast notification, input preserved so user can retry

### Empty States
- Staged section hides/collapses when empty (Staged (0) is not shown)
- No empty state placeholder message needed

### Refresh & Feedback
- Wait for server push after staging/unstaging — no optimistic UI
- Server triggers diff subscription refresh after each stage/unstage action (same pattern as post-commit today)

### OpenCode's Discretion
- Exact icon choice for the Stage/Unstage button
- Whether to show a loading indicator on the button while awaiting server confirmation

</decisions>

<specifics>
## Specific Ideas

- Reference pattern: standard git tool file-level staging (VS Code source control panel, GitKraken staging area)
- The existing accordion structure in DiffFileSection already has a header bar — the button goes inside it, not as a separate row

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-hunk-staging-commit*
*Context gathered: 2026-03-02*
