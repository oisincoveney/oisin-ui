# Requirements: Oisin UI

**Defined:** 2026-02-25
**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.

## v1.1 Requirements

Requirements for the v1.1 Hardening milestone.

### Runtime Reliability

- [ ] **RUN-01**: User can restart the Docker service and reconnect without daemon lock-churn loops.
- [ ] **RUN-02**: User sees terminal attach recover cleanly after reconnect without repeated `Terminal not found` error loops.
- [ ] **RUN-03**: User can create a thread during transient websocket disruption and gets a bounded actionable error instead of indefinite pending state.
- [ ] **RUN-04**: User can delete the active thread and immediately return to `No active thread` without stale attach retries.

### Thread Contract Completion

- [ ] **THRD-01**: Ensure-default terminal response includes `projectId` and `resolvedThreadId` in server payload.
- [ ] **THRD-02**: Web thread store consumes ensure-default metadata fields without compatibility placeholders.
- [ ] **THRD-03**: Thread switch and ensure flows keep metadata consistent across reconnect and refresh.

### Verification Determinism

- [ ] **VER-01**: Diff-panel browser regression runs with deterministic active-thread fixture and no conditional skip.
- [ ] **VER-02**: Thread management browser regression covers create -> switch -> delete with deterministic fixture setup.
- [ ] **VER-03**: Runtime gate and restart stability checks run reliably in one command sequence for local verification.

## v2 Requirements

Deferred to future release.

### Terminal

- **TERM-05**: Multiple terminal panes/tabs per thread

### Code Review

- **DIFF-02**: 3-panel Codex-inspired layout (sidebar + terminal + diff panel)
- **DIFF-03**: Stage/unstage hunks from the UI
- **DIFF-04**: Commit from the web interface

### Remote Access

- **REMO-01**: Remote access via relay server
- **REMO-02**: WSS/encrypted connections for remote use

## Out of Scope

Explicitly excluded from v1.1.

| Feature | Reason |
|---------|--------|
| New in-browser code editor | Hardening milestone; terminal-first remains core |
| Multi-user auth model | Not part of v1.1 reliability scope |
| Mobile native clients | Web flow hardening takes priority |

## Traceability

Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 06 | Pending |
| RUN-02 | Phase 06 | Pending |
| RUN-03 | Phase 06 | Pending |
| RUN-04 | Phase 06 | Pending |
| THRD-01 | Phase 07 | Pending |
| THRD-02 | Phase 07 | Pending |
| THRD-03 | Phase 07 | Pending |
| VER-01 | Phase 08 | Pending |
| VER-02 | Phase 08 | Pending |
| VER-03 | Phase 08 | Pending |

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after v1.1 milestone initialization*
