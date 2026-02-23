# Requirements: Oisin UI

**Defined:** 2026-02-21
**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Terminal & Connectivity

- [x] **TERM-01**: User can interact with a terminal session embedded in the browser per thread
- [x] **TERM-02**: WebSocket connection auto-reconnects with exponential backoff and state recovery
- [x] **TERM-03**: Terminal dimensions stay in sync across browser, WebSocket, and tmux/PTY
- [x] **TERM-04**: User can disconnect and reconnect to find their session exactly where they left off

### Project & Thread Management

- [x] **PROJ-01**: User can see all projects in a sidebar pulled from configured git repos
- [x] **PROJ-02**: User can create multiple threads per project, each with its own git worktree
- [x] **PROJ-03**: User can create and delete threads (worktree + tmux session lifecycle)
- [x] **PROJ-04**: User can switch between active threads with a click
- [x] **PROJ-05**: User can select which CLI agent to run per thread (OpenCode, Claude Code, etc.)

### Code Review

- [ ] **DIFF-01**: User can view uncommitted code changes per thread with syntax highlighting

### Deployment

- [x] **DOCK-01**: Application runs in a single Docker container (daemon + web UI + tmux)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

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

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Code editor (Monaco/CodeMirror) | Terminal-first — agents edit code, users review diffs |
| LLM API integration | Terminal passthrough — agents handle their own API calls |
| Custom agent protocol (ACP) | Terminal-based approach preferred for speed and compatibility |
| Codebase indexing/search | CLI agents handle this natively |
| Multi-user/auth | Single-user personal tool for v1 |
| Mobile native app | Web-first, accessible from phone browser |
| Voice/speech features | Stripped from Paseo — not needed |
| OpenClaw/Discord integration | Future phase after web UI is solid |
| Cloud deployment/hosting | Docker makes this portable, deploy after it works locally |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCK-01 | Phase 1: Foundation & Docker | Complete |
| TERM-01 | Phase 2: Terminal I/O | Complete |
| TERM-02 | Phase 2: Terminal I/O | Complete |
| TERM-03 | Phase 2: Terminal I/O | Complete |
| TERM-04 | Phase 2: Terminal I/O | Complete |
| PROJ-01 | Phase 3: Project & Thread Management | Complete |
| PROJ-02 | Phase 3: Project & Thread Management | Complete |
| PROJ-03 | Phase 3: Project & Thread Management | Complete |
| PROJ-04 | Phase 3: Project & Thread Management | Complete |
| PROJ-05 | Phase 3: Project & Thread Management | Complete |
| DIFF-01 | Phase 4: Code Diffs | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-23 after phase 3 verification*
