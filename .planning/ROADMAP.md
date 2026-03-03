# Roadmap: Oisin UI

## Overview

Oisin UI is a shipped, Docker-first web app for managing coding-agent terminal workflows across projects and threads. v3 TABS COOLERS transforms Oisin UI into a daily driver for multi-project AI-assisted development with multi-tab terminals, chat overlay, voice input, and git push.

## Milestones

- ✅ **v1 MVP** — shipped 2026-02-25 (phases 01-05, 34 plans) → `.planning/milestones/v1-ROADMAP.md`
- ✅ **v1.1 Hardening** — shipped 2026-02-28 (phases 06-08, 12 plans) → `.planning/milestones/v1.1-ROADMAP.md`
- ✅ **v2 Code Review** — shipped 2026-03-02 (phases 09-11, 18 plans) → `.planning/milestones/v2-ROADMAP.md`
- 🚧 **v3 TABS COOLERS** — in progress (phases 12-16)

## Current: v3 TABS COOLERS

*Terminal Agent Browser System for Concurrent Operations with Orchestrated Language Execution and Reliable Speech*

### Phase 12: Git Push

**Goal**: Users can push committed changes to remote without leaving the browser.
**Depends on**: Phase 11 (commit from browser)
**Requirements**: PUSH-01, PUSH-02, PUSH-03
**Success Criteria** (what must be TRUE):

  1. User sees a "Push" button in the diff panel when there are commits ahead of remote.
  2. User sees ahead/behind indicator (↑N ↓M) next to push button showing sync status with remote.
  3. User clicks Push, sees progress indicator, then success toast on completion.
  4. User sees actionable error message if push fails (auth failure, rejected, no remote).

**Plans:** 2 plans

Plans:
- [x] 12-01-PLAN.md — Push button with sync badge, progress, error handling
- [ ] 12-02-PLAN.md — Gap closure: fix push button for new branches without upstream

### Phase 13: Multi-Tab Terminals

**Goal**: Users can work with multiple terminal tabs within a single thread.
**Depends on**: Phase 12
**Requirements**: TABS-01, TABS-02, TABS-03, TABS-04, TABS-05, TABS-06
**Success Criteria** (what must be TRUE):

  1. User clicks "+" to add a new terminal tab; a new xterm.js Terminal appears backed by a tmux window.
  2. User clicks "×" on a tab to close it; the Terminal and tmux window are properly disposed.
  3. User double-clicks tab name to rename it; new name persists across tab switches.
  4. User sees visual status indicator on each tab (running command, idle, error state).
  5. Tab bar scrolls horizontally when many tabs exist; all tabs remain accessible.
  6. User disconnects and reconnects; all tab sessions restore with full scrollback and running processes.

**Plans**: TBD

### Phase 14: Background Agents

**Goal**: Users can monitor multiple running agents across projects from the sidebar.
**Depends on**: Phase 13
**Requirements**: AGENT-01, AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):

  1. User starts agent in project A, switches to project B; agent in project A continues running.
  2. User sees agent status badge on each project in sidebar (Generating, Idle, Waiting, Error).
  3. User sees git sync indicator on each project in sidebar (↑N ahead, ↓N behind, synced).

**Plans**: TBD

### Phase 15: AI Chat Overlay

**Goal**: Users can view AI interactions as chat bubbles instead of raw terminal output.
**Depends on**: Phase 13 (multi-tab for AI tabs)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07
**Success Criteria** (what must be TRUE):

  1. User clicks toggle to switch between terminal view and chat view on AI tabs.
  2. User sees chat messages as full-width colored blocks (assistant blue, user gray).
  3. User sees markdown rendered correctly including syntax-highlighted code blocks.
  4. User sees assistant response stream in real-time as tokens arrive.
  5. User sees "Thinking..." or spinner during processing phases before response begins.
  6. User expands tool call to see details (files read, files edited) in collapsible section.
  7. User sees file change summary with +/- line stats for files modified by assistant.

**Plans**: TBD

### Phase 16: Voice Input

**Goal**: Users can speak to AI agents via push-to-talk voice input.
**Depends on**: Phase 15 (chat input field)
**Requirements**: VOICE-01, VOICE-02, VOICE-03
**Success Criteria** (what must be TRUE):

  1. User holds push-to-talk button; audio recording begins.
  2. User sees recording indicator (pulsing red dot, waveform) while actively capturing.
  3. User releases button; audio transcribes via Whisper and text appears in chat input.

**Plans**: TBD

## Phases (All)

<details>
<summary>✅ v1.1 Hardening (Phases 06-08) — SHIPPED 2026-02-28</summary>

- [x] Phase 06: Runtime Reliability Hardening (8/8 plans) — completed 2026-02-26
- [x] Phase 07: Thread Metadata Contract Closure (2/2 plans) — completed 2026-02-27
- [x] Phase 08: Deterministic Verification Closure (2/2 plans) — completed 2026-02-28

</details>

<details>
<summary>✅ v2 Code Review (Phases 09-11) — SHIPPED 2026-03-02</summary>

- [x] Phase 09: Diff Panel Redesign (11/11 plans) — completed 2026-03-01
- [x] Phase 10: SQLite Thread Registry (5/5 plans) — completed 2026-03-01
- [x] Phase 11: File Staging & Commit (2/2 plans) — completed 2026-03-02

</details>

<details open>
<summary>🚧 v3 TABS COOLERS (Phases 12-16) — IN PROGRESS</summary>

- [ ] Phase 12: Git Push (1/2 plans) — gap closure pending
- [ ] Phase 13: Multi-Tab Terminals (0/? plans) — pending
- [ ] Phase 14: Background Agents (0/? plans) — pending
- [ ] Phase 15: AI Chat Overlay (0/? plans) — pending
- [ ] Phase 16: Voice Input (0/? plans) — pending

</details>

## Progress

| Phase | Milestone | Requirements | Plans Complete | Status | Completed |
|-------|-----------|--------------|----------------|--------|-----------|
| 06. Runtime Reliability Hardening | v1.1 | RUN-01..04 | 8/8 | Complete | 2026-02-26 |
| 07. Thread Metadata Contract Closure | v1.1 | THRD-01..03 | 2/2 | Complete | 2026-02-27 |
| 08. Deterministic Verification Closure | v1.1 | VER-01..03 | 2/2 | Complete | 2026-02-28 |
| 09. Diff Panel Redesign | v2 | DIFF-02 | 11/11 | Complete | 2026-03-01 |
| 10. SQLite Thread Registry | v2 | INFRA-01 | 5/5 | Complete | 2026-03-01 |
| 11. File Staging & Commit | v2 | DIFF-03, DIFF-04 | 2/2 | Complete | 2026-03-02 |
| 12. Git Push | v3 | PUSH-01..03 | 1/2 | Gap Closure | - |
| 13. Multi-Tab Terminals | v3 | TABS-01..06 | 0/? | Pending | - |
| 14. Background Agents | v3 | AGENT-01..03 | 0/? | Pending | - |
| 15. AI Chat Overlay | v3 | CHAT-01..07 | 0/? | Pending | - |
| 16. Voice Input | v3 | VOICE-01..03 | 0/? | Pending | - |

## Research Context (v3)

See: `.planning/research/SUMMARY.md`

**Key insights:**
- Git push backend exists (`checkout_push_request` in session.ts:4609-4635) — UI wiring only
- Multi-tab uses existing binary mux protocol with multiple streamIds per thread
- Chat overlay consumes existing `AgentTimelineItem` via `agent_stream` messages
- Voice uses existing `DictationStreamManager` infrastructure
- Critical pitfall: xterm.js memory leaks — must dispose correctly on tab close

---
_Roadmap updated: 2026-03-02 — v3 TABS COOLERS phases 12-16 defined._
