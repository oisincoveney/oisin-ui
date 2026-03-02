# Requirements: Oisin UI

**Defined:** 2026-02-25
**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.

## v2 Requirements

Requirements for the v2 Code Review milestone.

### Code Review UI

- **DIFF-02**: User can open an improved diff panel with a file list (left column showing per-file +/- stats) and an inline diff viewer (right column), replacing the current flat single-column layout.
- **DIFF-03**: User can stage and unstage individual files from the diff panel via inline "Stage" / "Unstage" buttons on each file row, with the staged/unstaged file list updating accordingly.
- **DIFF-04**: User can write a commit message and commit staged changes directly from the browser UI without leaving the app.

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
| DIFF-02 | Phase 09 | Complete |
| DIFF-03 | Phase 11 | Pending |
| DIFF-04 | Phase 11 | Pending |

**Coverage:**
- v2 requirements: 3 total
- Mapped to phases: 3
- Unmapped: 0

---

## Archive

### v1.1 Requirements (Complete)

All v1.1 requirements closed 2026-02-28. See: `.planning/milestones/v1.1-REQUIREMENTS.md`

### v1 Requirements (Complete)

All v1 requirements closed 2026-02-25. See: `.planning/milestones/v1-REQUIREMENTS.md`

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-03-02 — DIFF-03 scope narrowed to file-level staging (hunk-level deferred)*
