# Roadmap: Oisin UI

## Overview

v1.1 Hardening closes the remaining reliability and verification gaps from v1 so core thread workflows stay stable under restart, reconnect, and delete churn. The milestone is organized into three requirement-driven delivery boundaries: runtime behavior hardening, thread metadata contract completion, and deterministic verification closure. Each phase delivers a user-observable reliability outcome and unblocks the next layer.

## Milestones

- ✅ **v1 MVP** — shipped 2026-02-25 (phases 01-05, 34 plans) → `.planning/milestones/v1-ROADMAP.md`
- ✅ **v1.1 Hardening** — shipped 2026-02-28 (phases 06-08, 12 plans) → `.planning/milestones/v1.1-ROADMAP.md`
- 🚧 **v2 Code Review** — in progress (phases 09-11) → DIFF-02, DIFF-03, DIFF-04

## Phases

- [x] **Phase 06: Runtime Reliability Hardening** - Restart/reconnect/create/delete flows remain bounded and recoverable. (Completed 2026-02-26)
- [x] **Phase 07: Thread Metadata Contract Closure** - Active thread context remains consistent across ensure/reconnect/refresh. (Completed 2026-02-27)
- [x] **Phase 08: Deterministic Verification Closure** - Browser/runtime hardening checks run deterministically in one repeatable path. (Completed 2026-02-28)
- [x] **Phase 09: Diff Panel Redesign** - Users see collapsible Staged/Unstaged sections with inline diff expansion and per-file stats. (Completed 2026-03-01)
- [ ] **Phase 10: SQLite Thread Registry** - ThreadRegistry backed by SQLite; provisioning status pattern; startup-only reconciliation; reaper deleted; worktree path validation.
- [ ] **Phase 11: Hunk Staging & Commit** - Users can stage/unstage individual hunks and commit staged changes directly from the browser.

## Phase Details

### Phase 06: Runtime Reliability Hardening

**Goal**: Users can recover from restart and websocket churn without manual cleanup or stuck thread state.
**Depends on**: Phase 05
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04
**Success Criteria** (what must be TRUE):

  1. User can restart Docker services and reconnect to the app without daemon lock-churn loops.
  2. User sees terminal attach recover after reconnect without repeated `Terminal not found` loops.
  3. User can create a thread during transient websocket disruption and gets a bounded actionable error instead of indefinite pending.
  4. User can delete the active thread and immediately land in `No active thread` with no stale attach retries.
**Plans**: 8 plans
Plans:

- [x] 06-01-PLAN.md — Harden create-thread bounded actionable failure contract (RUN-03).
- [x] 06-02-PLAN.md — Add bounded queued terminal input and flush semantics (RUN-02 prerequisite).
- [x] 06-03-PLAN.md — Implement 60s bounded attach recovery state machine + visible retry UX (RUN-02).
- [x] 06-04-PLAN.md — Enforce active-delete immediate null state + cancel stale attach retries (RUN-04).
- [x] 06-05-PLAN.md — Add serverId restart warm-up gating and restore/fallback recovery flow (RUN-01).
- [x] 06-06-PLAN.md — Close deterministic verification for RUN-01..RUN-04 with tests/docs.
- [x] 06-07-PLAN.md — Close server-side first-request websocket race and startup blocking gap.
- [x] 06-08-PLAN.md — Add client readiness barrier and refresh deterministic verification evidence.

### Phase 07: Thread Metadata Contract Closure

**Goal**: Users always stay on the correct project/thread context through ensure-default, thread switching, reconnect, and refresh.
**Depends on**: Phase 06
**Requirements**: THRD-01, THRD-02, THRD-03
**Success Criteria** (what must be TRUE):

  1. User session state resolves to the correct active project/thread after ensure-default, without missing-context placeholder behavior.
  2. User can switch threads and consistently see the selected thread context preserved across reconnect.
  3. User can refresh with an active thread and return to the same resolved thread context without metadata drift.
**Plans**: 2 plans
Plans:

- [x] 07-01-PLAN.md — Add getActiveThread() to registry; emit real projectId/resolvedThreadId in ensure-default response; clean schema placeholder
- [x] 07-02-PLAN.md — Unit tests for getActiveThread(); e2e test for ensure-default metadata contract

### Phase 08: Deterministic Verification Closure

**Goal**: Users and maintainers can verify hardening scope with deterministic browser/runtime checks on demand.
**Depends on**: Phase 07
**Requirements**: VER-01, VER-02, VER-03
**Success Criteria** (what must be TRUE):

  1. Diff-panel browser regression runs against a deterministic active-thread fixture with no conditional skip path.
  2. Thread management browser regression deterministically validates create -> switch -> delete fixture flow.
  3. A single command sequence runs runtime gate and restart stability checks reliably for local verification.
**Plans**: 2 plans
Plans:

- [x] 08-01-PLAN.md — Migrate diff-panel.spec.ts to isolated server/e2e runtime fixture, no conditional skip (VER-01)
- [x] 08-02-PLAN.md — Add create->click-switch->delete test to thread-management-web.spec.ts (VER-02, VER-03)

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
  2. Thread creation writes status='provisioning' first; crash mid-create is detected and cleaned up on next startup.
  3. Orphaned worktrees (on disk, not in DB) are deleted once at startup — no periodic polling.
  4. Missing worktree path on terminal reattach surfaces as thread error state in the UI, not a silent hang.
  5. sessionKey and agentId are never persisted to DB; they are runtime-only in-memory state.
  6. ThreadSessionReaper is fully deleted (no file, no references).
**Plans**: 5 plans
Plans:

- [ ] 10-01-PLAN.md — SQLite setup: db.ts with WAL mode, FK, projects + threads schema
- [ ] 10-02-PLAN.md — Rewrite ThreadRegistry with SQLite backend (identical public interface)
- [ ] 10-03-PLAN.md — startup-reconcile.ts: crash recovery + orphan worktree cleanup
- [ ] 10-04-PLAN.md — Wire bootstrap.ts, delete session-reaper.ts, add worktree path validation
- [ ] 10-05-PLAN.md — Rewrite thread-registry.test.ts, delete session-reaper.test.ts, add startup-reconcile.test.ts

### Phase 11: Hunk Staging & Commit

**Goal**: Users can stage individual diff hunks and commit staged changes without leaving the browser.
**Depends on**: Phase 09
**Requirements**: DIFF-03, DIFF-04
**Success Criteria** (what must be TRUE):

  1. User sees a "Stage hunk" button on each unstaged hunk; clicking it moves the hunk to the Staged tab and updates the file's +/- counts in the file list.
  2. User sees an "Unstage hunk" button on each staged hunk; clicking it moves the hunk back to Unstaged.
  3. User types a commit message in the commit bar and clicks Commit; staged changes are committed and the Staged tab clears.
  4. User cannot submit an empty commit message; the Commit button is disabled until text is entered.
**Plans**: 2 plans
Plans:

- [ ] 11-01-PLAN.md — TBD
- [ ] 11-02-PLAN.md — TBD

## Progress

| Phase | Milestone | Requirements | Plans Complete | Status | Completed |
|-------|-----------|--------------|----------------|--------|-----------|
| 06. Runtime Reliability Hardening | v1.1 | RUN-01, RUN-02, RUN-03, RUN-04 | 8/8 | Complete | 2026-02-26 |
| 07. Thread Metadata Contract Closure | v1.1 | THRD-01, THRD-02, THRD-03 | 2/2 | Complete | 2026-02-27 |
| 08. Deterministic Verification Closure | v1.1 | VER-01, VER-02, VER-03 | 2/2 | Complete | 2026-02-28 |
| 09. Diff Panel Redesign | v2 | DIFF-02 | 11/11 | Complete | 2026-03-01 |
| 10. SQLite Thread Registry | v2 | INFRA-01 | 0/5 | Pending | — |
| 11. Hunk Staging & Commit | v2 | DIFF-03, DIFF-04 | 0/TBD | Pending | — |

---
_Roadmap updated: 2026-03-01 — Phase 10 (SQLite Thread Registry) inserted; Hunk Staging & Commit becomes Phase 11._
