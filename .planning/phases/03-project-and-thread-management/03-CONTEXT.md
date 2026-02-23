# Phase 3: Project & Thread Management - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage multiple projects and threads, each with isolated git worktrees and terminal sessions. Covers: project listing, thread CRUD, thread switching, agent selection, and worktree lifecycle. Does NOT cover code diffs (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Sidebar Structure
- Use ShadCN sidebar blocks — do NOT hand-roll sidebar components, copy from shadcn
- Projects expanded by default, threads visible immediately
- Thread rows show: name + relative activity time ("2m ago")
- Thread status: colored dot + short text label (running/idle/error)
- No thread count badge on project rows — user sees threads by expanding
- "New Thread" button at top of sidebar (not per-project)
- Projects added via UI button (not config file only)

### Thread Creation Flow
- Dialog collects: thread name (user prompted), agent/command selection, base branch
- Research Codex and similar tools for UX patterns on agent/branch selection
- Agent selection sources from OpenCode instance — only OpenCode for now, but must support agents and slash commands (not just CLIs)
- Branch picker shows local + remote branches
- Agent auto-starts immediately on thread creation
- Auto-switch to new thread after creation
- Errors shown inline in the dialog (not toast)

### Thread Switching
- Previous terminal stays alive in background (agent keeps running)
- Active thread: bold text + background highlight in sidebar
- Keyboard shortcut: Cmd+Up/Down to navigate threads, wraps around
- Auto-scroll to bottom on switch
- Unread indicator (dot/badge) on threads with new background output
- Toast + status change when background thread's agent exits or errors

### Thread Deletion
- Delete allowed anytime, even while agent is running (kills it)
- Simple confirm dialog ("Delete thread X?")
- Warn if worktree has uncommitted changes, require extra confirmation
- Post-delete navigation: OpenCode's discretion

### OpenCode's Discretion
- Sidebar sizing/collapsibility (within ShadCN sidebar patterns)
- Thread switch loading state (instant vs brief spinner)
- Post-delete landing (previous thread vs project home)
- Exact visual treatment of status dots and activity timestamps

</decisions>

<specifics>
## Specific Ideas

- Use ShadCN sidebar blocks as the foundation — mandatory, not optional
- Research Codex and Paseo UIs for agent/command selection patterns
- Agent list should eventually support: CLI tools (opencode, claude, codex), GSD agents, build/plan agents, and slash commands
- For now, only OpenCode needs to work — but architecture should not be hardcoded to one agent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-project-and-thread-management*
*Context gathered: 2026-02-22*
