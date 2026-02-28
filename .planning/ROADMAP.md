# Roadmap: Oisin UI

## Overview

v1.1 Hardening closes the remaining reliability and verification gaps from v1 so core thread workflows stay stable under restart, reconnect, and delete churn. The milestone is organized into three requirement-driven delivery boundaries: runtime behavior hardening, thread metadata contract completion, and deterministic verification closure. Each phase delivers a user-observable reliability outcome and unblocks the next layer.

## Milestones

- ✅ **v1 MVP** — shipped 2026-02-25 (phases 01-05, 34 plans) → `.planning/milestones/v1-ROADMAP.md`
- ✅ **v1.1 Hardening** — shipped 2026-02-28 (phases 06-08, 12 plans) → `.planning/milestones/v1.1-ROADMAP.md`
- 🚧 **v2 Code Review** — in progress (phases 09-10) → DIFF-02, DIFF-03, DIFF-04

## Phases

- [x] **Phase 06: Runtime Reliability Hardening** - Restart/reconnect/create/delete flows remain bounded and recoverable. (Completed 2026-02-26)
- [x] **Phase 07: Thread Metadata Contract Closure** - Active thread context remains consistent across ensure/reconnect/refresh. (Completed 2026-02-27)
- [x] **Phase 08: Deterministic Verification Closure** - Browser/runtime hardening checks run deterministically in one repeatable path. (Completed 2026-02-28)
- [ ] **Phase 09: Diff Panel Redesign** - Users see a two-column diff panel with per-file stats and Unstaged/Staged/Against Main tabs.
- [ ] **Phase 10: Hunk Staging & Commit** - Users can stage/unstage individual hunks and commit staged changes directly from the browser.

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

**Goal**: Users see a structured two-column diff panel replacing the flat single-column layout.
**Depends on**: Phase 08
**Requirements**: DIFF-02
**Success Criteria** (what must be TRUE):

  1. User opens the diff panel and sees a left column listing all changed files with per-file +/- line counts.
  2. User can switch between Unstaged, Staged, and Against Main tabs; the file list and diff content update to reflect the selected view.
  3. User clicks a file in the left column and the right column renders that file's diff inline.
  4. Renamed files (R status) appear correctly in the file list without broken display.
**Plans**: TBD
Plans:

### Phase 10: Hunk Staging & Commit

**Goal**: Users can stage individual diff hunks and commit staged changes without leaving the browser.
**Depends on**: Phase 09
**Requirements**: DIFF-03, DIFF-04
**Success Criteria** (what must be TRUE):

  1. User sees a "Stage hunk" button on each unstaged hunk; clicking it moves the hunk to the Staged tab and updates the file's +/- counts in the file list.
  2. User sees an "Unstage hunk" button on each staged hunk; clicking it moves the hunk back to Unstaged.
  3. User types a commit message in the commit bar and clicks Commit; staged changes are committed and the Staged tab clears.
  4. User cannot submit an empty commit message; the Commit button is disabled until text is entered.
**Plans**: 4 plans
Plans:

- [ ] 09-01-PLAN.md — Extend diff-types + diff-store for staged/unstaged dual subscriptions and tab state
- [ ] 09-02-PLAN.md — Create DiffFileRow component (slim file row for left column)
- [ ] 09-03-PLAN.md — Rewrite DiffPanel with two-column layout (file list + inline diff viewer)
- [ ] 09-04-PLAN.md — Wire App.tsx to new DiffPanel props + update e2e spec

## Progress

| Phase | Milestone | Requirements | Plans Complete | Status | Completed |
|-------|-----------|--------------|----------------|--------|-----------|
| 06. Runtime Reliability Hardening | v1.1 | RUN-01, RUN-02, RUN-03, RUN-04 | 8/8 | Complete | 2026-02-26 |
| 07. Thread Metadata Contract Closure | v1.1 | THRD-01, THRD-02, THRD-03 | 2/2 | Complete | 2026-02-27 |
| 08. Deterministic Verification Closure | v1.1 | VER-01, VER-02, VER-03 | 2/2 | Complete | 2026-02-28 |
| 09. Diff Panel Redesign | v2 | DIFF-02 | 0/4 | Pending | — |
| 10. Hunk Staging & Commit | v2 | DIFF-03, DIFF-04 | 0/TBD | Pending | — |

---
_Roadmap updated: 2026-02-28 — v2 Code Review milestone added (phases 09-10)._
