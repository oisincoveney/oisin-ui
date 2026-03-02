# Requirements Archive: v2 Code Review

**Archived:** 2026-03-02
**Status:** ✅ SHIPPED

This is the archived requirements specification for v2.
For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

---

# Requirements: Oisin UI

**Defined:** 2026-02-25
**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.

## v2 Requirements

Requirements for the v2 Code Review milestone.

### Code Review UI

- [x] **DIFF-02**: User can open an improved diff panel with a file list (left column showing per-file +/- stats) and an inline diff viewer (right column), replacing the current flat single-column layout.
- [x] **DIFF-03**: User can stage and unstage individual files from the diff panel via inline "Stage" / "Unstage" buttons on each file row, with the staged/unstaged file list updating accordingly.
- [x] **DIFF-04**: User can write a commit message and commit staged changes directly from the browser UI without leaving the app.

## Out of Scope for v2

Explicitly deferred to future milestones.

| Feature | Reason |
|---------|--------|
| TERM-05: Multiple terminal panes/tabs | Deferred — focus is code review UI |
| REMO-01/02: Remote relay access | Deferred — not in v2 scope |
| Hunk-level staging (git add -p) | Can be added later as DIFF-05 |
| Side-by-side diff view toggle | Can be added later as DIFF-06 |
| Push to remote from browser | Post-commit action, deferred to v3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIFF-02 | Phase 09 | ✅ Complete |
| DIFF-03 | Phase 11 | ✅ Complete |
| DIFF-04 | Phase 11 | ✅ Complete |

**Coverage:**
- v2 requirements: 3 total
- Shipped: 3
- Unmapped: 0

---

## Milestone Summary

**Shipped:** 3 of 3 v2 requirements

**Adjusted:** None — all requirements shipped as originally specified

**Dropped:** None

**Notes:**
- DIFF-02 evolved from "two-column layout" to "collapsible accordion" based on reference UI (Superset.sh)
- DIFF-03 implemented at file level (not hunk level) — hunk staging deferred to DIFF-05
- Infrastructure requirement INFRA-01 (SQLite thread registry) added mid-milestone for persistence reliability

---

*Archived: 2026-03-02 as part of v2 milestone completion*
