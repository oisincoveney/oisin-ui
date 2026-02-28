# Oisin UI

## Current State

**Shipped version:** v1.1 Hardening (2026-02-28)

Oisin UI is a shipped, Docker-first web app for managing coding-agent terminal workflows across projects and threads. Users can create/switch/delete thread sessions backed by isolated git worktrees, interact through reconnect-safe browser terminals, and review per-thread code diffs without leaving the app. Runtime reliability is hardened: restart, reconnect, delete, and attach lifecycle flows are all bounded and recoverable.

## Core Value

Work on your code from anywhere with your OpenCode instance and settings, reliably.

## Last Milestone: v1.1 Hardening (Complete)

**Delivered:** Runtime reliability hardening, thread metadata contract closure, and deterministic verification closure.

**What shipped:**
- Bounded attach recovery FSM (60s deadline, visible retry UX)
- Bounded create-thread failure with typed dialog contract
- Active-delete immediate null state with stale-attach cancellation
- ServerId-keyed restart detection, warm-up gating, restore/fallback flow
- `getActiveThread()` registry + real `projectId`/`resolvedThreadId` in ensure-default
- First-request WebSocket race closed; `waitForPostConnectReady` barrier added
- Diff-panel + thread-management deterministic browser regression fixtures

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

### Out of Scope

- Mobile native app (web-first remains the strategy)
- Multi-user/auth (still single-user local-first)
- ACP-based protocol rewrite (terminal-first remains canonical)

## Current Milestone: v2 Code Review

**Goal:** Improved code review UI — file list with per-file stats, hunk-level staging/unstaging, and commit from browser.

**Requirements:** DIFF-02, DIFF-03, DIFF-04
**Phases:** 09+ (starting 2026-02-28)

### What ships in v2

- Redesigned diff panel: two-column layout (file list left, diff viewer right) with per-file +/- stats, Unstaged/Staged/Against Main tabs
- Inline "Stage hunk" / "Unstage hunk" buttons on each diff hunk
- Commit message input + Commit button to commit staged changes from the browser

## Context

- Tech stack: TypeScript monorepo (server + web + cli), Bun, Docker, tmux, xterm.js.
- Milestone archives:
  - `.planning/milestones/v1-ROADMAP.md`
  - `.planning/milestones/v1-REQUIREMENTS.md`
  - `.planning/milestones/v1.1-ROADMAP.md`
  - `.planning/milestones/v1.1-REQUIREMENTS.md`

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

---
*Last updated: 2026-02-28 — v2 Code Review milestone started*
