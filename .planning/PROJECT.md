# Oisin UI

## Current State

**Shipped version:** v2 Code Review (2026-03-02)

Oisin UI is a shipped, Docker-first web app for managing coding-agent terminal workflows across projects and threads. Users can create/switch/delete thread sessions backed by isolated git worktrees, interact through reconnect-safe browser terminals, and review per-thread code diffs with file staging and commit from browser.

## Core Value

Work on your code from anywhere with your OpenCode instance and settings, reliably.

## Current Milestone: v3 TABS COOLERS

*Terminal Agent Browser System for Concurrent Operations with Orchestrated Language Execution and Reliable Speech*

**Goal:** Make Oisin UI a daily driver for multi-project AI-assisted development with chat-style AI interaction and voice input.

**Target features:**
- Multi-tab threads (N terminal tabs per thread, including AI tabs)
- AI tab = chat UI wrapper over OpenCode terminal (parse output → render as chat)
- Multiple AI tabs per thread (like Conductor)
- Background agents across projects (switch projects while agents run)
- Voice input via containerized Whisper transcription
- Push to remote from browser UI
- Fully Dockerized deployment

## Last Milestone: v2 Code Review (Complete)

**Delivered:** Improved code review UI with file list, per-file stats, file-level staging/unstaging, and commit from browser.

**What shipped:**
- Redesigned diff panel with collapsible Staged/Unstaged sections and per-file +/- stats
- Inline diff expansion within accordion (no separate right-pane viewer)
- File-level stage/unstage via +/- buttons in diff panel
- Commit message input + Commit button to commit staged changes from browser
- SQLite-backed thread registry with startup orphan cleanup
- Thread-scoped diff isolation via projectId/threadId in subscribe contract

## Requirements

### Validated

- ✓ Multi-project sidebar showing configured projects — v1
- ✓ Multi-thread support per project with git worktrees — v1
- ✓ Isolated tmux-backed terminal session per thread — v1
- ✓ Embedded terminal per thread with reconnect recovery — v1
- ✓ Code diff view per thread with syntax highlighting — v1
- ✓ Docker single-container packaging/runtime closure — v1
- ✓ OpenCode/Codex provider selection in thread creation flow — v1
- ✓ Reliable browser-daemon WebSocket connectivity — v1
- ✓ Runtime reconnect/attach lifecycle stable under restart/delete churn — v1.1
- ✓ Ensure-default response emits and wires `projectId`/`resolvedThreadId` end-to-end — v1.1
- ✓ Browser regression suite runs deterministically with active-thread fixture — v1.1
- ✓ Thread create/delete UX bounded and actionable under websocket disruption — v1.1
- ✓ Docker startup/restart path self-healing without manual operator steps — v1.1
- ✓ Improved diff panel with file list and per-file stats (DIFF-02) — v2
- ✓ Stage/unstage individual files from diff panel (DIFF-03) — v2
- ✓ Commit staged changes from browser UI (DIFF-04) — v2

### Active

- [ ] Multi-tab threads (N terminal tabs per thread)
- [ ] AI tab as chat UI wrapper over OpenCode terminal
- [ ] Multiple AI tabs per thread
- [ ] Background agents across projects
- [ ] Voice input via containerized Whisper
- [ ] Push to remote from browser UI

### Out of Scope

- Mobile native app (web-first remains the strategy)
- Multi-user/auth (still single-user local-first)
- ACP-based protocol rewrite (terminal-first remains canonical)
- Hunk-level staging (git add -p) — can be added later as DIFF-05
- Side-by-side diff view toggle — can be added later as DIFF-06
- Remote relay access (REMO-01/02) — deferred to v4

## Context

- Tech stack: TypeScript monorepo (server + web + cli), Bun, Docker, tmux, xterm.js, SQLite.
- ~281K LOC TypeScript
- Milestone archives:
  - `.planning/milestones/v1-ROADMAP.md`
  - `.planning/milestones/v1-REQUIREMENTS.md`
  - `.planning/milestones/v1.1-ROADMAP.md`
  - `.planning/milestones/v1.1-REQUIREMENTS.md`
  - `.planning/milestones/v2-ROADMAP.md`
  - `.planning/milestones/v2-REQUIREMENTS.md`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Terminal-first agent sessions via tmux | Fastest path to support multiple CLI agents without protocol reimplementation | ✓ Good (v1) |
| Docker-first single-container deployment | Portable self-hosting with predictable local/runtime behavior | ✓ Good (v1) |
| External stores for thread/diff websocket lifecycle | Avoid React ownership churn for long-lived streaming state | ✓ Good (v1) |
| Evidence-gated runtime closure for DOCK-01 | Prevent false milestone closure and enforce operational truth | ✓ Good (v1) |
| Bounded FIFO queue for terminal input durability | Oldest-first eviction prevents unbounded memory with safe flush semantics | ✓ Good (v1.1) |
| ServerId identity for restart detection | Decouples restart detection from transport reconnect noise | ✓ Good (v1.1) |
| `waitForPostConnectReady` barrier for first-RPC safety | Eliminates race between WS connect and session dispatch readiness | ✓ Good (v1.1) |
| Accordion diff layout over two-column | Matches reference UI (Superset.sh), simpler implementation | ✓ Good (v2) |
| SQLite for thread registry over JSON | Eliminates stale/null state bugs, enables startup orphan cleanup | ✓ Good (v2) |
| Thread-scoped diff via projectId/threadId | Prevents cross-thread diff pollution on multi-thread workflows | ✓ Good (v2) |

---
*Last updated: 2026-03-02 — v3 TABS COOLERS milestone started*
