# Oisin UI

## Current State

**Shipped version:** v1 MVP (2026-02-25)

Oisin UI is now a shipped, Docker-first web app for managing coding-agent terminal workflows across projects and threads. Users can create/switch/delete thread sessions backed by isolated git worktrees, interact through reconnect-safe browser terminals, and review per-thread code diffs without leaving the app.

## Core Value

Work on your code from anywhere with your OpenCode instance and settings, reliably.

## Current Milestone: v1.1 Hardening

**Goal:** Eliminate remaining runtime reliability and verification debt so everyday thread workflows stay stable without manual recovery.

**Target features:**
- Deterministic reconnect/runtime behavior across restart, delete, and attach flows
- Complete ensure-default metadata contract from server through web consumers
- Deterministic active-thread fixture path for diff/terminal browser regressions

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

### Active

- [ ] Runtime reconnect and attach lifecycle is stable under restart/delete churn
- [ ] Ensure-default response emits and wires `projectId` and `resolvedThreadId` end-to-end
- [ ] Browser regression suite runs deterministically with active-thread fixture, no conditional skip paths
- [ ] Thread create/delete UX remains bounded and actionable under websocket disruption
- [ ] Docker startup/restart path remains self-healing without manual operator steps

### Out of Scope

- Mobile native app (web-first remains the strategy)
- Multi-user/auth for v1.1 baseline (still single-user local-first)
- ACP-based protocol rewrite (terminal-first remains canonical)

## Next Milestone Goals

1. Harden runtime stability and reconnect ergonomics under kill/restart scenarios.
2. Close known cross-phase contract and attach lifecycle debt from v1 verification.
3. Make local and CI verification deterministic for thread/diff critical paths.

## Context

- Tech stack: TypeScript monorepo (server + web + cli), Bun, Docker, tmux, xterm.js.
- Milestone archives:
  - `.planning/milestones/v1-ROADMAP.md`
  - `.planning/milestones/v1-REQUIREMENTS.md`
  - `.planning/milestones/v1-v1-MILESTONE-AUDIT.md`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Terminal-first agent sessions via tmux | Fastest path to support multiple CLI agents without protocol reimplementation | ✓ Good (v1) |
| Docker-first single-container deployment | Portable self-hosting with predictable local/runtime behavior | ✓ Good (v1) |
| External stores for thread/diff websocket lifecycle | Avoid React ownership churn for long-lived streaming state | ✓ Good (v1) |
| Evidence-gated runtime closure for DOCK-01 | Prevent false milestone closure and enforce operational truth | ✓ Good (v1) |

---
*Last updated: 2026-02-25 after starting v1.1 Hardening milestone*
