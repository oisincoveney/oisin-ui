# Phase 2: Terminal I/O - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can interact with a live terminal session in the browser that survives disconnects. Includes wiring up xterm.js, streaming I/O to a tmux session, and handling window resizes and socket reconnection gracefully.

</domain>

<decisions>
## Implementation Decisions

### Terminal UI/Layout
- The terminal should fill the screen for this phase, but be built as a component that can easily live next to a Phase 3 sidebar.
- Match the terminal colors to the UI theme (ShadCN/Tailwind CSS variables).
- Strictly embedded in the main tab (no popout windows).
- Bundle a specific programming font (e.g., Fira Code, JetBrains Mono) rather than relying on system fonts.

### Reconnect UX
- When reconnecting, use the UI overlay we already built to indicate status. No lines need to be printed directly into the xterm buffer (e.g., no `=== Reconnected ===`).
- Fetch the full tmux scrollback history on initial load and after hard refreshes.
- If the browser tab is hard-refreshed, auto-attach to the exact same tmux session they were just in.
- If the websocket disconnects but the browser tab is NOT refreshed, do a "Refresh from server" (clear the screen and redraw everything).
- If the daemon runs a long task while disconnected, "catch up" by fetching the missed output via tmux's scrollback.
- If the user was scrolled up during the disconnect, jump the cursor back to the bottom when catching up on new output.
- Debounce window resize events to tmux, but keep printing output during the debounce period (don't pause the stream).
- Infinite retry for reconnects if the daemon goes down.
- Reconnection visual confirmation is just the silent removal of the overlay.
- Force a terminal refresh if the user switches away from the tab and comes back later (frozen OS tab).
- If the user types keystrokes at the exact moment a disconnect happens, do whatever is easier (e.g., discard them if not easily buffered).

### Disconnect States
- Visually blur the terminal behind the "Disable input - Reconnecting" overlay.
- Users should still be able to highlight and copy text from the frozen/blurred terminal buffer.
- The disconnect state should trigger instantly when the socket closes.
- Update the small connection status indicator to show "Terminal disconnected" while the overlay is visible.
- The UI overlay blocking pointer events is sufficient; no need to explicitly tell xterm.js to disable itself.
- Clear any keystrokes that happen before the overlay fully catches them so they aren't unexpectedly executed later.
- Log reconnect attempts and failures to the browser console for debugging.

### Session Bootstrap
- For Phase 2 (before the sidebar), name the single tmux session using the current directory name.
- Automatically run a specific agent command (e.g. `opencode`) inside the tmux session instead of a standard shell.
- Let tmux handle natural exit behavior (if the user types `exit` or `Ctrl+D`, the pane closes naturally).

### OpenCode's Discretion
- Whether to implement a client-side heartbeat to detect silent hangs.
- What initial working directory to use when creating the default tmux session.

</decisions>

<specifics>
## Specific Ideas

- The goal is a terminal that takes up the screen but has the structural groundwork laid out for Phase 3's sidebar layout.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-terminal-i-o*
*Context gathered: 2026-02-22*
