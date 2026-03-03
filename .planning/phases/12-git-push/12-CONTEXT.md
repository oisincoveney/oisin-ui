# Phase 12: Git Push - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can push committed changes to remote without leaving the browser. Push button in diff panel, sync status indicator, progress feedback, and error handling.

Backend already exists (`checkout_push_request` in session.ts) — this phase is UI wiring only.

</domain>

<decisions>
## Implementation Decisions

### Push button placement & style
- Next to commit button in diff panel header
- Icon + text style ("Push" with upload arrow)
- Always visible, disabled when nothing to push (consistent UI)

### Sync status display
- Badge on push button showing ↑N ↓M counts
- When diverged (ahead AND behind): show both counts, push still available
- User decides whether to push when diverged — no blocking

### Progress & feedback
- Button becomes spinner during push (loading state)
- Success: toast only ("Pushed N commits to origin/main")

### Error handling
- Auth failures: error toast suggesting terminal for credential config
- Force push: defer to later — not in scope for initial implementation

### OpenCode's Discretion
- Exact toast wording and duration
- Disabled button styling
- Spinner implementation details

</decisions>

<specifics>
## Specific Ideas

- Badge integrated into push button (not separate indicator)
- Keep it simple — this is a quick win phase, backend exists

</specifics>

<deferred>
## Deferred Ideas

- Force push support — future enhancement if needed

</deferred>

---

*Phase: 12-git-push*
*Context gathered: 2026-03-02*
