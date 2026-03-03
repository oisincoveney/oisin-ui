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

## v1.1 Hardening (Shipped: 2026-02-28)

**Delivered:** Runtime reliability hardening, thread metadata contract closure, and deterministic verification closure across restart, reconnect, delete, and attach lifecycle scenarios.

**Phases completed:** 06-08 (12 plans total)

**Key accomplishments:**

- Hardened create-thread bounded failure contract with typed dialog UX (RUN-03).
- Added bounded queued terminal input with flush semantics and 60s attach recovery FSM (RUN-02).
- Enforced active-delete immediate null state with stale attach retry cancellation (RUN-04).
- Added serverId-keyed restart detection, warm-up gating, and restore/fallback recovery (RUN-01).
- Closed server-side first-request WebSocket race and async provider availability probing.
- Added `waitForPostConnectReady` barrier and daemon e2e first-RPC reliability assertions.
- Shipped `getActiveThread()` registry and real `projectId`/`resolvedThreadId` in ensure-default response (THRD-01..03).
- Migrated diff-panel spec to isolated fixture with no conditional skip path (VER-01).
- Added create->click-switch->delete deterministic thread management regression (VER-02, VER-03).

**Stats:**

- 157 files changed
- 8,202 insertions / 10,291 deletions (net -2,089)
- 3 phases, 12 plans, 72 commits
- 3 days from start to ship (2026-02-26 -> 2026-02-28)

**Git range:** `862e516` -> `dc12878`

**What's next:** v2 Code Review

---

## v2 Code Review (Shipped: 2026-03-02)

**Delivered:** Improved code review UI with file list, per-file stats, file-level staging/unstaging, and commit from browser.

**Phases completed:** 09-11 (18 plans total)

**Key accomplishments:**

- Redesigned diff panel with collapsible Staged/Unstaged sections and per-file +/- stats.
- Inline diff expansion within accordion (no separate right-pane viewer).
- File-level stage/unstage via +/- buttons in diff panel.
- Commit message input + Commit button to commit staged changes from browser.
- SQLite-backed thread registry with startup orphan cleanup.
- Thread-scoped diff isolation via projectId/threadId in subscribe contract.

**Git range:** `dc12878` -> `e91ab49`

**What's next:** v3 TABS COOLERS — multi-tab terminals, AI chat overlay, voice input, git push.

---
