# Requirements: Oisin UI

**Defined:** 2026-03-02
**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.

## v3 Requirements

Requirements for the v3 TABS COOLERS milestone.

*Terminal Agent Browser System for Concurrent Operations with Orchestrated Language Execution and Reliable Speech*

### Multi-Tab Terminals

- [ ] **TABS-01**: User can add new terminal tabs within a thread
- [ ] **TABS-02**: User can close terminal tabs
- [ ] **TABS-03**: User can rename tabs (double-click or context menu)
- [ ] **TABS-04**: User can see tab status indicators (running/idle/error)
- [ ] **TABS-05**: Tab bar handles overflow with scroll when many tabs
- [ ] **TABS-06**: Terminal sessions restore fully on reconnect (output, scrollback, running processes via tmux)

### Background Agents

- [ ] **AGENT-01**: Multiple projects can have running agents concurrently
- [ ] **AGENT-02**: Project sidebar shows agent activity status per project (Generating, Idle, Waiting, Error)
- [ ] **AGENT-03**: Project sidebar shows git sync status (↑N ahead, ↓N behind, synced)

### AI Chat Overlay

- [ ] **CHAT-01**: User can toggle between terminal view and chat view for AI tabs
- [ ] **CHAT-02**: Chat displays messages as full-width colored blocks (Conductor-style)
- [ ] **CHAT-03**: Chat renders markdown and syntax-highlighted code blocks
- [ ] **CHAT-04**: Chat shows streaming responses as they arrive
- [ ] **CHAT-05**: Chat shows thinking/processing phases with visual indicator
- [ ] **CHAT-06**: Chat shows tool calls with collapsible details (files read, files edited)
- [ ] **CHAT-07**: Chat shows files changed with +/- stats

### Voice Input

- [ ] **VOICE-01**: User can press push-to-talk button to record voice
- [ ] **VOICE-02**: Recording indicator shows when actively capturing audio
- [ ] **VOICE-03**: Voice transcription via containerized local Whisper

### Git Push

- [x] **PUSH-01**: User can push committed changes to remote via button
- [x] **PUSH-02**: UI shows ahead/behind remote indicator
- [x] **PUSH-03**: Push shows progress and success/error feedback

## Out of Scope for v3

Explicitly deferred to future milestones.

| Feature | Reason |
|---------|--------|
| Keyboard shortcuts for tabs | Browser conflicts (Cmd+T/W), defer to v4 |
| Split panes within tabs | Added complexity, defer to v4 |
| Hunk-level staging (git add -p) | Can be added later as DIFF-05 |
| Remote relay access (REMO-01/02) | Not in v3 scope |
| Force push option | Can be added later |
| Create PR after push | Use `gh pr create` in terminal |
| Voice activity detection (VAD) | Start with PTT, add VAD later |
| Whisper API option | Start with local Whisper only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PUSH-01 | Phase 12 | Complete |
| PUSH-02 | Phase 12 | Complete |
| PUSH-03 | Phase 12 | Complete |
| TABS-01 | Phase 13 | Pending |
| TABS-02 | Phase 13 | Pending |
| TABS-03 | Phase 13 | Pending |
| TABS-04 | Phase 13 | Pending |
| TABS-05 | Phase 13 | Pending |
| TABS-06 | Phase 13 | Pending |
| AGENT-01 | Phase 14 | Pending |
| AGENT-02 | Phase 14 | Pending |
| AGENT-03 | Phase 14 | Pending |
| CHAT-01 | Phase 15 | Pending |
| CHAT-02 | Phase 15 | Pending |
| CHAT-03 | Phase 15 | Pending |
| CHAT-04 | Phase 15 | Pending |
| CHAT-05 | Phase 15 | Pending |
| CHAT-06 | Phase 15 | Pending |
| CHAT-07 | Phase 15 | Pending |
| VOICE-01 | Phase 16 | Pending |
| VOICE-02 | Phase 16 | Pending |
| VOICE-03 | Phase 16 | Pending |

**Coverage:**
- v3 requirements: 22 total
- Mapped to phases: 22 ✓
- Unmapped: 0

---

## Archive

### v2 Requirements (Complete)

All v2 requirements closed 2026-03-02. See: `.planning/milestones/v2-REQUIREMENTS.md`

### v1.1 Requirements (Complete)

All v1.1 requirements closed 2026-02-28. See: `.planning/milestones/v1.1-REQUIREMENTS.md`

### v1 Requirements (Complete)

All v1 requirements closed 2026-02-25. See: `.planning/milestones/v1-REQUIREMENTS.md`

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — Phase 12 complete (PUSH-01..03)*
