# Oisin UI

## Current State

**Shipped version:** v1 MVP (2026-02-25)

Oisin UI is now a shipped, Docker-first web app for managing coding-agent terminal workflows across projects and threads. Users can create/switch/delete thread sessions backed by isolated git worktrees, interact through reconnect-safe browser terminals, and review per-thread code diffs without leaving the app.

## Core Value

Work on your code from anywhere with your OpenCode instance and settings, reliably.

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

- [ ] Define v1.1 goals and requirements (hardening + UX debt)
- [ ] Close ensure-default metadata contract gap (`projectId` / `resolvedThreadId` emission)
- [ ] Remove conditional diff e2e skip by provisioning deterministic active-thread fixture

### Out of Scope

- Mobile native app (web-first remains the strategy)
- Multi-user/auth for v1.1 baseline (still single-user local-first)
- ACP-based protocol rewrite (terminal-first remains canonical)

## Next Milestone Goals

1. Harden runtime stability and reconnect ergonomics under kill/restart scenarios.
2. Reduce known tech debt from v1 verification reports.
3. Improve deterministic local and CI verification coverage.

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
*Last updated: 2026-02-25 after v1 milestone completion*
