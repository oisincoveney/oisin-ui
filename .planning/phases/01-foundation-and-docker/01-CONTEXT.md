# Phase 1: Foundation & Docker - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A running daemon serves a web client inside Docker, and they can talk to each other. This establishes the structural foundation of the project by stripping unused Paseo code, scaffolding a modern web client, and configuring robust containerization.
</domain>

<decisions>
## Implementation Decisions

### Web Client Architecture
- Replace Paseo's Expo client with Vite + React 19 SPA
- Use Bun, Oxc, and strict TypeScript rules
- Full Effect TS architecture for async, networking, and core state
- Strict ShadCN component usage (Base UI registry first, community registries if missing, no raw HTML/inline styling)
- Tailwind CSS for styling

### Docker & Containerization
- Debian Bookworm base image (for node-pty/tmux compatibility)
- Run daemon as `root` inside container (simplifies git worktree permissions)
- Use `tini` as PID 1 to properly reap orphaned tmux/pty processes
- Include a `docker-compose.yml` for easy developer mounting
- Pre-install standard dev tools: `tmux`, `git`, `curl`, `build-essential`
- Volume mappings:
  - `/workspace` for git repositories
  - A separate volume (e.g., `/config`) for daemon settings/state persistence
  - Mount `.ssh` (read-only) for accessing private repositories
- Export a random high port for the Web UI

### Connection Flow & Status
- Show a fullscreen loading spinner while the initial WebSocket connection establishes
- If WebSocket drops, overlay a "Disable input" state to prevent commands while reconnecting
- Reconnection strategy: Exponential backoff with infinite retries
- On successful reconnection: Append output inline to terminal (do not clear screen)
- Server drives the 30s ping/pong heartbeat

### Paseo Cleanup Scope
- **Delete:** `packages/app` (Expo mobile/web), `packages/desktop` (Tauri), `packages/website` (docs)
- **Delete:** `packages/relay` (remote access will be handled via reverse proxies/Tailscale later)
- **Keep:** `packages/cli` (useful for headless workflows)
- **Keep:** Voice and speech-to-text infrastructure in the daemon (critical for later UI phases)

### OpenCode's Discretion
- Node.js version inside the Docker container
- How to package/bundle the React Vite app into the Node daemon for single-container serving

</decisions>

<specifics>
## Specific Ideas

- Remote access philosophy: Oisin UI acts as a local service. It doesn't need to know it's remote. Access from the outside world is handled by Tailscale, VPNs, or reverse proxies providing authentication and TLS.

</specifics>

<deferred>
## Deferred Ideas

- Voice Input UI: The user wants voice transcription as a primary input method (like Codex's voice button). The daemon infra is preserved, but the UI component is deferred to a later phase.
- Remote Authentication: HTTP Basic Auth or similar access controls for when exposing via reverse proxies (currently Oisin assumes it's behind a trusted network).

</deferred>

---

*Phase: 01-foundation-and-docker*
*Context gathered: 2026-02-21*