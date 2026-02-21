# Oisin UI

## What This Is

A self-hosted web UI for managing AI coding agents across multiple projects and threads. Built as an improved fork of Paseo, with a Codex-inspired interface. Each thread gets its own git worktree and terminal session running OpenCode (or other CLI agents). Runs in Docker so it's accessible from anywhere — laptop, home server, or cloud.

## Core Value

Work on your code from anywhere with your OpenCode instance and settings, reliably.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-project sidebar showing all projects pulled from Git
- [ ] Multi-thread support per project with git worktrees
- [ ] Each thread gets an isolated terminal session (tmux) running the coding agent
- [ ] Code diff view per thread showing uncommitted changes
- [ ] Embedded terminal per thread for direct interaction
- [ ] Codex-inspired UI layout (sidebar with projects/threads, center chat, right panel for diffs)
- [ ] Docker container packaging for portable deployment
- [ ] OpenCode as primary coding agent via terminal
- [ ] Model and agent selector that actually works (Paseo's is broken)
- [ ] Slash command support (GSD, OpenSpec, etc.) via terminal passthrough
- [ ] Reliable WebSocket connection (Paseo's drops frequently)

### Out of Scope

- Mobile native app — web-first, accessible from phone browser later
- OpenClaw/Discord integration — future phase after web UI is solid
- Cloud deployment/hosting — Docker makes this portable, deploy after it works locally
- Authentication/access control — single-user local-first for v1
- Sandboxing/isolation between threads — not needed, trust the environment
- ACP protocol — terminal-based approach preferred for speed and compatibility
- Multi-user support — this is a personal tool

## Context

**Starting point:** Fork of [Paseo](https://github.com/getpaseo/paseo) (v0.1.15). Existing fork at `~/dev/old-oisin-ui/` with custom node relay (replaced Cloudflare). Paseo architecture: daemon managing agent terminal processes + Expo web/mobile client + relay for remote connectivity.

**Existing Paseo architecture:**
- `packages/server` — Daemon (agent process orchestration, WebSocket API, MCP server)
- `packages/app` — Expo client (iOS, Android, web)
- `packages/cli` — CLI for daemon and agent workflows
- `packages/desktop` — Tauri desktop app
- `packages/relay` — Relay for remote connectivity
- `packages/website` — Marketing site/docs

**Key problems with current Paseo:**
- Model/agent dropdown selectors don't work with OpenCode
- Unreliable — things break frequently, it's very early (v0.1.15)
- Only supported Cloudflare relay (custom node relay was created as workaround)
- UI is functional but not polished

**Design reference:** OpenAI Codex app — sidebar with projects/threads, center panel for chat/agent output, right panel for code diffs and terminals. Clean, fast, dark theme.

**Terminal-first approach:** Use tmux sessions per worktree/thread. This gives all CLI tools for free (OpenCode, Claude Code, etc.) — just need a nice web interface on top of terminal I/O. No need to reimplement agent protocols.

**Future integrations:**
- OpenClaw (https://github.com/openclaw/openclaw) for Discord/mobile access — OpenClaw is a personal AI assistant platform with native Discord channel support. Could serve as the gateway/backend or just the Discord bridge.
- GSD workflow, OpenSpec, and other slash command tooling
- Cloud deployment on home server or VPS

## Constraints

- **Tech stack**: Fork of Paseo (TypeScript monorepo, Expo web, Node.js daemon) — work within existing architecture
- **Deployment**: Must run in a single Docker container
- **Agent interface**: Terminal-based (tmux) — no ACP dependency
- **Single user**: Personal tool, no multi-tenancy concerns
- **Performance**: Must feel fast — Codex (Electron) is too slow, this should be snappy as a web app

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork Paseo rather than build from scratch | Core architecture (daemon + web UI + terminal sessions) is sound, problems are fixable | — Pending |
| Terminal-based agent sessions via tmux | Gets all CLI tools for free, avoids ACP reliability issues, best speed | — Pending |
| Codex-inspired UI layout | Best UX pattern for multi-project multi-thread coding with diffs | — Pending |
| Docker-first deployment | Portability across laptop, home server, cloud | — Pending |
| Web UI as v1 priority over Discord/mobile | Most impactful — work from anywhere via browser | — Pending |

---
*Last updated: 2026-02-21 after initialization*
