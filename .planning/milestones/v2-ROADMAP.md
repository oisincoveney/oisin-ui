# Milestone v2: Code Review

**Status:** ✅ SHIPPED 2026-03-02
**Phases:** 09-11
**Total Plans:** 18

## Overview

v2 Code Review delivers an improved code review UI with file list, per-file stats, file-level staging/unstaging, and commit from browser. The milestone also includes SQLite-backed thread registry for improved persistence reliability.

## Phases

### Phase 09: Diff Panel Redesign

**Goal**: Users see collapsible Staged/Unstaged sections with inline diff expansion replacing the flat single-column layout.
**Depends on**: Phase 08
**Requirements**: DIFF-02
**Success Criteria** (what must be TRUE):

  1. User opens the diff panel and sees collapsible "Staged (N)" and "Unstaged (N)" sections with per-file +/- line counts.
  2. User expands a section and clicks a file to see its diff rendered inline within the same panel (no separate right-pane viewer).
  3. Staged and unstaged files are sourced from separate daemon diff calls and displayed in their respective sections.
  4. Renamed files (R status) appear correctly in the file list without broken display.
**Plans**: 11 plans

Plans:

- [x] 09-01-PLAN.md — Add commit bar + Changes section to DiffPanel; tooltip path + new/del badges in DiffFileSection
- [x] 09-02-PLAN.md — Verify/update e2e spec for updated layout
- [x] 09-03-PLAN.md — Split daemon diff into stagedFiles/unstagedFiles; propagate through schema, session, web types
- [x] 09-04-PLAN.md — Replace single Changes section with Staged/Unstaged collapsibles in DiffPanel
- [x] 09-05-PLAN.md — Add section header assertions to e2e spec
- [x] 09-06-PLAN.md — Fix terminal thrash on diff panel open/close (UAT gap 1)
- [x] 09-07-PLAN.md — Wire updatedAt to DiffPanel; guard stale scroll-to-bottom (UAT gap 2)
- [x] 09-08-PLAN.md — Server-side stale worktree cwd recovery in diff subscription (UAT gap 3)
- [x] 09-09-PLAN.md — Re-verify and fix renamed file display after gaps 1-3 closed (UAT gap 4)
- [x] 09-10-PLAN.md — Thread-scoped diff cwd recovery; add projectId/threadId to subscribe contract (UAT gap 4 re-open)
- [x] 09-11-PLAN.md — Terminal stale-cwd validation on rehydrate; kill stale tmux sessions (UAT gap 5)

### Phase 10: SQLite Thread Registry

**Goal**: ThreadRegistry is backed by SQLite; worktree-deletion bugs from stale/null JSON state are eliminated.
**Depends on**: Phase 09
**Requirements**: INFRA-01
**Success Criteria** (what must be TRUE):

  1. Server starts with a fresh SQLite DB; no JSON registry file is read or written.
  2. If server crashes mid-create (after worktree exists, before DB write), the orphan worktree is detected and deleted by startup reconciliation. No provisioning status is used.
  3. Orphaned worktrees (on disk, not in DB) are deleted once at startup — no periodic polling.
  4. Missing worktree path on terminal reattach surfaces as thread error state in the UI, not a silent hang.
  5. sessionKey and agentId are never persisted to DB; they are runtime-only in-memory state.
  6. ThreadSessionReaper is fully deleted (no file, no references).
**Plans**: 5 plans

Plans:

- [x] 10-01-PLAN.md — SQLite setup: db.ts with WAL mode, FK, projects + threads schema
- [x] 10-02-PLAN.md — Rewrite ThreadRegistry with SQLite backend (identical public interface)
- [x] 10-03-PLAN.md — startup-reconcile.ts: crash recovery + orphan worktree cleanup
- [x] 10-04-PLAN.md — Wire bootstrap.ts, delete session-reaper.ts, add worktree path validation
- [x] 10-05-PLAN.md — Rewrite thread-registry.test.ts, delete session-reaper.test.ts, add startup-reconcile.test.ts

### Phase 11: File Staging & Commit

**Goal**: Users can stage individual files and commit staged changes without leaving the browser.
**Depends on**: Phase 09
**Requirements**: DIFF-03, DIFF-04
**Success Criteria** (what must be TRUE):

  1. User sees a Stage button on each unstaged file; clicking stages the file and moves it to Staged section.
  2. User sees an Unstage button on each staged file; clicking unstages the file and moves it back to Unstaged.
  3. User types a commit message in the commit bar and clicks Commit; staged changes are committed and the Staged section clears.
  4. User cannot submit an empty commit message; the Commit button is disabled until text is entered and files are staged.
**Plans**: 2 plans

Plans:

- [x] 11-01-PLAN.md — Backend: Add stage/unstage message types and session handlers
- [x] 11-02-PLAN.md — Frontend: Wire commit form, add Stage/Unstage buttons to file rows

## Progress

| Phase | Milestone | Requirements | Plans Complete | Status | Completed |
|-------|-----------|--------------|----------------|--------|-----------|
| 09. Diff Panel Redesign | v2 | DIFF-02 | 11/11 | Complete | 2026-03-01 |
| 10. SQLite Thread Registry | v2 | INFRA-01 | 5/5 | Complete | 2026-03-01 |
| 11. File Staging & Commit | v2 | DIFF-03, DIFF-04 | 2/2 | Complete | 2026-03-02 |

---

## Milestone Summary

**Key Decisions:**
- Diff panel keeps toggle behaviour (not always-visible column)
- Target layout: accordion/collapsible — "Staged (N)" and "Unstaged (N)" sections with inline diff expansion; commit bar at bottom
- Thread registry persistence uses SQLite with WAL mode
- sessionKey and agentId remain runtime-only (not persisted in DB schema)
- Thread-scoped diff isolation via projectId/threadId in subscribe contract

**Issues Resolved:**
- Terminal thrash on diff panel open/close
- Stale worktree cwd recovery for diff and terminal
- Renamed file display in diff panel
- JSON registry stale/null state bugs

**Technical Debt Closed:**
- sessionKey runtime-only test added (quick task 004)
- Stage/unstage toast feedback wired (quick task 004)

---

_Archived: 2026-03-02 as part of v2 milestone completion_
_For current project status, see .planning/ROADMAP.md_
