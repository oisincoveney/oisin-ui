# Phase 10: SQLite Thread Registry - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace JSON-based ThreadRegistry with SQLite. Add provisioning status to detect incomplete creates. Run startup-only reconciliation for crash recovery and orphan cleanup. Delete ThreadSessionReaper entirely. Surface broken threads (missing worktree) in the UI. No new user-facing features — this is infrastructure that eliminates a class of stale/null state bugs.

</domain>

<decisions>
## Implementation Decisions

### Thread creation atomicity
- Thread creation is worktree-first, DB-last: worktree created on disk first, DB row written as `status='idle'` only after worktree and terminal exist
- If the server crashes before the DB write, the worktree is an orphan on disk with no DB row — caught by startup orphan cleanup
- No provisioning status needed; DB rows are either complete (`idle`) or don't exist

### Missing worktree behavior
- Copy Conductor (conductor.build) for all missing-worktree behavior
- A thread whose worktree was deleted outside the app shows as broken/unavailable in the UI
- Broken threads can only be deleted — not used or recovered
- Users should be warned not to delete worktree directories outside the app (Conductor surfaces this as a reminder in settings)
- Detection happens at the appropriate point (startup reconciliation + attach time) — not eager disk polling

### Startup reconciliation
- Runs once at boot, synchronously, before any clients connect
- Handles one case: worktree directory on disk with no DB row → orphan → delete from disk
- DB threads whose worktree is missing from disk are detected lazily (at attach time), not at startup
- Nothing runs periodically after startup — no polling

### Session reaper removal
- `ThreadSessionReaper` is fully deleted: no file, no imports, no references
- Its periodic cleanup responsibility is not replaced with another periodic mechanism
- Stale runtime sessions (e.g., agent process crash without server restart) are detected lazily at next attach attempt
- Copy Conductor's model: problems surface when the user tries to use the thread, not proactively

### Runtime-only state
- `sessionKey` and `agentId` are never persisted to DB — in-memory only
- Only persistent thread metadata goes to SQLite

### OpenCode's Discretion
- SQLite schema design (column names, indexes, FK constraints, WAL config)
- Exact broken-thread UI representation (badge style, error message copy)
- How missing-worktree state is propagated from server to web client
- Test fixture approach for startup reconciliation tests

</decisions>

<specifics>
## Specific Ideas

- Conductor (conductor.build) is the reference for all worktree-related UX — use their behavior as the model for broken workspace state, user warnings, and deletion flow
- "As long as it works" — pragmatic delivery over polish; correctness and reliability matter more than UX elaboration

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-sqlite-thread-registry*
*Context gathered: 2026-03-01*
