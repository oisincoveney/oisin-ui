---
phase: 10-sqlite-thread-registry
verified: 2026-03-02T04:30:49Z
status: gaps_found
score: 5/6 success criteria verified
gaps:
  - truth: "bootstrap.ts wiring is clean and purposeful"
    status: partial
    reason: "bootstrap.ts calls initDb() and runStartupReconciliation() correctly, but line 293 creates an orphaned `new ThreadRegistry(config.paseoHome, logger)` whose return value is discarded. The instance is never used — each Session creates its own ThreadRegistry. This is dead code / confusion, not a runtime bug."
    artifacts:
      - path: "packages/server/src/server/bootstrap.ts"
        issue: "Line 293: `new ThreadRegistry(config.paseoHome, logger)` — result discarded, object immediately GC'd"
    missing:
      - "Remove the dead `new ThreadRegistry(...)` call at bootstrap.ts:293"
---

# Phase 10: SQLite Thread Registry Verification Report

**Phase Goal:** ThreadRegistry is backed by SQLite; worktree-deletion bugs from stale/null JSON state are eliminated.
**Verified:** 2026-03-02T04:30:49Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server starts with fresh SQLite DB; no JSON registry file read/written | ✓ VERIFIED | `db.ts` uses `sqlite` + WAL. No JSON file read/write anywhere in server code. Session creates `ThreadRegistry(paseoHome)` which calls `initDb()`. |
| 2 | Crash mid-create orphan worktree detected & deleted by startup reconciliation (no provisioning status) | ✓ VERIFIED | `createThread` writes to DB after worktree creation. `runStartupReconciliation` deletes worktrees on disk with no DB row. No `provisioning` status in `ThreadStatus` enum. |
| 3 | Orphaned worktrees deleted once at startup — no periodic polling | ✓ VERIFIED | `runStartupReconciliation` called once in `start()` before server listens. No interval/timer. `session-reaper.ts` fully deleted. |
| 4 | Missing worktree path on terminal reattach surfaces as thread error state | ✓ VERIFIED | `switchThread()` in `thread-lifecycle.ts` calls `fs.access(worktreePath)`, catches failure, calls `updateThreadStatus({status:'error'})`, throws error to surface to UI. |
| 5 | sessionKey and agentId never persisted to DB; runtime-only in-memory state | ✓ VERIFIED | DB schema has no `session_key` or `agent_id` columns. Both stored in `Map<string,string>` on `ThreadRegistry` instance. SQL INSERTs/UPDATEs omit them entirely. |
| 6 | ThreadSessionReaper fully deleted (no file, no references) | ✓ VERIFIED | `packages/server/src/server/thread/session-reaper.ts` — does not exist. No imports or references to it anywhere in codebase. |

**Score: 5/6 (all functional criteria met; one dead-code issue)**

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/server/src/server/thread/db.ts` | ✓ VERIFIED | 54 lines. Exports `initDb`, `getDb`, `DbHandle`. WAL mode + FK ON. Schema: `projects` + `threads` with correct constraints. |
| `packages/server/src/server/thread/thread-registry.ts` | ✓ VERIFIED | 796 lines. Full SQLite-backed implementation. `agentId`/`sessionKey` in-memory maps, not in DB. Public interface unchanged. |
| `packages/server/src/server/thread/startup-reconcile.ts` | ✓ VERIFIED | 71 lines. Exports `runStartupReconciliation`. Uses `getDb()` + `listPaseoWorktrees` + `deletePaseoWorktreeChecked`. One-shot, no polling. |
| `packages/server/src/server/bootstrap.ts` | ⚠️ PARTIAL | `initDb()` called at line 292. `runStartupReconciliation()` called in `start()` at line 524 (before server listens). BUT `new ThreadRegistry(...)` at line 293 is dead code — instance discarded. |
| `packages/server/src/server/thread/thread-lifecycle.ts` | ✓ VERIFIED | `switchThread()` validates worktree path via `fs.access()` at line 278, sets `status:'error'`, throws error to surface to UI. |
| `packages/server/src/server/thread/thread-registry.test.ts` | ✓ VERIFIED | 9 tests, all SQLite-backed using `:memory:` DB. Covers: createThread (idle direct), deleteThread, switchThread, getActiveThread, findThreadByAgentId, findThreadByTerminalId, listThreads. |
| `packages/server/src/server/thread/startup-reconcile.test.ts` | ✓ VERIFIED | 3 tests covering orphan deletion, known worktree preservation, error resilience. All pass. |
| `packages/server/src/server/thread/session-reaper.ts` | ✓ DELETED | File does not exist. |
| `packages/server/src/server/thread/session-reaper.test.ts` | ✓ DELETED | File does not exist. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `db.ts` | SQLite WAL | `PRAGMA journal_mode=WAL` | ✓ WIRED | Line 10 |
| `db.ts` | FK enforcement | `PRAGMA foreign_keys=ON` | ✓ WIRED | Line 11 |
| `thread-registry.ts` | `db.ts` | `getDb()` / `initDb()` | ✓ WIRED | `load()` calls `initDb()`, `database()` calls `getDb()` as fallback |
| `startup-reconcile.ts` | `db.ts` | `getDb()` | ✓ WIRED | Line 24 |
| `startup-reconcile.ts` | worktree utils | `listPaseoWorktrees`, `deletePaseoWorktreeChecked` | ✓ WIRED | Lines 4-6, 33, 58 |
| `bootstrap.ts` | `db.ts` | `initDb()` at startup | ✓ WIRED | Line 292 |
| `bootstrap.ts` | `startup-reconcile.ts` | `runStartupReconciliation()` in `start()` | ✓ WIRED | Line 524, before `httpServer.listen()` |
| `thread-lifecycle.ts` | worktree path on disk | `fs.access()` before `ensureThreadTerminal` | ✓ WIRED | Line 278 in `switchThread()` |
| `session.ts` mapAgentLifecycleToThreadStatus | ThreadStatus | fallback returns `'error'` not `'unknown'` | ✓ VERIFIED | Line 816: `return 'error'` |

---

## Schema Verification

**`threads` table constraints verified:**
- `status TEXT NOT NULL CHECK(status IN ('idle','running','error','closed'))` — ✓ no `provisioning`, no `unknown`
- `worktree_path TEXT NOT NULL` — ✓ enforced at schema + application level (`createThread` throws if missing)
- `project_id REFERENCES projects(project_id) ON DELETE CASCADE` — ✓ FK with cascade delete
- No `session_key` column — ✓
- No `agent_id` column — ✓

---

## Test Results

```
✓ src/server/thread/thread-registry.test.ts (9 tests) 30ms
✓ src/server/thread/thread-lifecycle.test.ts (4 tests) 23ms
✓ src/server/thread/startup-reconcile.test.ts (3 tests) 454ms

Test Files  3 passed (3)
     Tests  16 passed (16)
```

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bootstrap.ts` | 293 | `new ThreadRegistry(config.paseoHome, logger)` — return value discarded | ⚠️ Warning | Dead code. No runtime impact: `initDb(dbPath)` on line 292 initializes the DB singleton correctly; `runStartupReconciliation` uses `getDb()` which works. Sessions create their own `ThreadRegistry` instances. The orphaned object is just confusion. |

**Note on `finalizeCreatedThreadProvisioning` in session.ts:** The word "provisioning" appears in a private method name in `session.ts` that handles post-create worktree setup (running setup commands + launching agent). This is **not** a `ThreadStatus` value — it's an internal process name. The `ThreadStatus` enum is correctly restricted to `idle/running/error/closed` with no `provisioning` status. ✓

---

## Gaps Summary

All 6 phase success criteria are functionally achieved. The single gap is cosmetic: `bootstrap.ts:293` creates a `ThreadRegistry` instance whose value is immediately discarded (dead code). This does not affect correctness — `initDb()` already ran on line 292, `runStartupReconciliation` works correctly, and Sessions create their own instances. However it is misleading code that should be removed.

The test suite (plan 10-05) is missing one specifically required test case: "updateThread with sessionKey — sessionKey in memory; NOT in DB (verify via direct db.get)". The plan explicitly called for this. However, the implementation is correct (no `session_key` column in schema, no SQL writes of sessionKey), and the `findThreadByAgentId` test does verify agentId is not in a DB column. The missing test is a coverage gap, not a functional gap.

---

_Verified: 2026-03-02T04:30:49Z_
_Verifier: Claude Code (gsd-verifier)_
