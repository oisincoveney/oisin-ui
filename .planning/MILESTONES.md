# Project Milestones: Oisin UI

## v1 MVP (Shipped: 2026-02-25)

**Delivered:** Docker-first web terminal workspace for multi-project, multi-thread coding-agent workflows with per-thread diffs and verified runtime closure.

**Phases completed:** 01-05 (34 plans total)

**Key accomplishments:**

- Shipped daemon+web Docker foundation with dynamic WebSocket host resolution.
- Delivered reconnect-safe terminal streaming with tmux-authoritative sessions and resize/replay reliability.
- Shipped project/thread lifecycle with isolated worktrees, provider selection, and create/switch/delete UX.
- Shipped per-thread diff review with git-order payload fidelity, rename metadata, and syntax-highlight rendering.
- Closed DOCK-01 with restart/runtime evidence gates (browser-origin WS 101, tmux-live, no-orphan stop proof).

**Stats:**

- 700 files changed
- 24,710 insertions / 104,171 deletions (net -79,461)
- 5 phases, 34 plans, 85 tasks
- 4 days from start to ship (2026-02-21 -> 2026-02-25)

**Git range:** `458d165` -> `768cee6`

**What's next:** v1.1 hardening and UX debt paydown.

---
