# Phase 06: Runtime Reliability Hardening - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden restart/reconnect/create/delete runtime behavior so users recover without stuck state, stale attach loops, or manual cleanup. Scope is reliability behavior for existing thread workflows only.

</domain>

<decisions>
## Implementation Decisions

### Reconnect recovery
- On disconnect with active thread, keep last terminal output visible and show reconnect overlay.
- If reconnect succeeds but attach fails, retry while showing visible indicator.
- Retry window is 60 seconds, then fail.
- During retry window, input remains enabled with queued send behavior.
- Retry status should be prominent (alert-bar style), not subtle.
- On successful recovery, clear prior error state automatically.
- Preserve current thread selection throughout reconnect failure handling.
- After terminal success recovery, show small success toast: `Reconnected`.

### Create-thread failures
- If create request cannot be sent (socket not open), fail immediately with inline dialog error.
- If setup/bootstrap fails, primary user action is viewing failure details.
- Default error presentation is summary + expandable details.
- `Creating...` state must revert exactly at timeout boundary.
- Timeout/failure path keeps all form values intact for retry.
- Failure signaling remains dialog-scoped (no global toast for this path).
- Failure details support one-click copy.
- Retry keeps same title by default (no automatic rename/suffix behavior).

### Delete-active-thread behavior
- After confirm delete on active thread, switch main panel immediately to `No active thread`.
- Remove deleted thread row from sidebar immediately (no transient closed row).
- If delete fails, restore previous active thread selection.
- Use standard destructive confirm dialog (no extra custom confirmation ceremony).

### Restart experience
- After Docker restart, auto-restore same previously active thread when available.
- During daemon warm-up, use minimal status chip (not global blocking banner).
- Block risky actions (create/switch/delete) while warm-up is incomplete.
- Disabled risky actions should explain reason via tooltip + disabled button state.
- On successful recovery, show small success toast text: `Reconnected`.
- When restoring thread after restart, attempt scroll-position resume.
- If previous active thread no longer exists, auto-select newest available thread.

### OpenCode's Discretion
- Exact visual styling and spacing of overlays, alert bars, tooltip text, and toasts.
- Exact wording for non-primary helper text around disabled states and error details.

</decisions>

<specifics>
## Specific Ideas

- Preserve visible terminal context during reconnect (`keep last output`) rather than clearing to placeholder.
- Recovery UX should feel explicit and trustworthy: visible retry state + clear success confirmation.
- Failure handling should optimize quick retry loops: keep user inputs, provide copyable diagnostics.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-runtime-reliability-hardening*
*Context gathered: 2026-02-25*
