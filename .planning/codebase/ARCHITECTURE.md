# Architecture

**Analysis Date:** 2026-02-21

## Pattern Overview

**Overall:** Event-driven client-daemon architecture with real-time WebSocket streaming

**Key Characteristics:**

- Daemon process (`packages/server`) runs on the developer's local machine, managing agent processes and exposing a WebSocket API
- Mobile/web/desktop clients connect to the daemon either directly (LAN) or via an encrypted relay (remote)
- All agent communication flows through a single `Session` object per WebSocket client connection
- Agent providers (Claude, Codex, OpenCode) are abstracted behind a common `AgentClient`/`AgentManager` interface
- End-to-end encryption (E2EE) is applied on relay paths using a daemon keypair; direct connections rely on network trust

## Layers

**Daemon Bootstrap Layer:**

- Purpose: Wires all subsystems together and starts the HTTP+WebSocket server
- Location: `packages/server/src/server/bootstrap.ts`
- Contains: Express app setup, AgentManager/AgentStorage instantiation, speech runtime init, relay transport start, WebSocket server creation
- Depends on: All subsystems (agent, speech, terminal, relay, MCP)
- Used by: `packages/server/src/server/index.ts` (entry point)

**WebSocket Transport Layer:**

- Purpose: Accepts WebSocket connections, maps each to a `Session`, handles binary multiplexing
- Location: `packages/server/src/server/websocket-server.ts` (`VoiceAssistantWebSocketServer`)
- Contains: Connection lifecycle, session reconnect/grace-period logic, push notification dispatch, attention broadcast
- Depends on: `Session`, `AgentManager`, push services, relay transport
- Used by: Bootstrap layer, relay transport (external socket attachment)

**Session Layer:**

- Purpose: Per-client request handling — all RPC calls from the app land here
- Location: `packages/server/src/server/session.ts` (~6800 lines)
- Contains: Agent CRUD, file explorer, terminal ops, voice/dictation, checkout/git actions, download tokens
- Depends on: `AgentManager`, `AgentStorage`, `TerminalManager`, speech providers
- Used by: `VoiceAssistantWebSocketServer`

**Agent Management Layer:**

- Purpose: Lifecycle management of running agent processes
- Location: `packages/server/src/server/agent/agent-manager.ts` (`AgentManager`)
- Contains: Start/stop/resume agents, timeline tracking, permission handling, subscriber fan-out
- Depends on: `AgentClient` (per-provider), `AgentStorage`
- Used by: `Session`, `VoiceAssistantWebSocketServer`, MCP server

**Agent Provider Layer:**

- Purpose: Provider-specific adapters that normalize external agent CLIs/SDKs to a common interface
- Location: `packages/server/src/server/agent/providers/` (claude/, codex/, opencode/)
- Contains: `claude-agent.ts`, `codex-app-server-agent.ts`, `opencode-agent.ts`; tool-call mappers, timeline parsers
- Depends on: Provider SDKs (`@anthropic-ai/claude-agent-sdk`, codex CLI, opencode binary)
- Used by: `AgentManager` via `AgentClient` interface

**Agent Storage Layer:**

- Purpose: Persist agent records to disk as JSON files
- Location: `packages/server/src/server/agent/agent-storage.ts` (`AgentStorage`)
- Contains: Read/write agent JSON under `$PASEO_HOME/agents/{cwd-slug}/{agent-id}.json`
- Depends on: Node.js `fs`, zod schemas
- Used by: `AgentManager`, `Session`, persistence hooks

**MCP Server Layer:**

- Purpose: Expose Paseo agent-management operations as an MCP tool server (for agents to call other agents)
- Location: `packages/server/src/server/agent/mcp-server.ts`
- Contains: `list_agents`, `create_agent`, `send_message`, `wait_for_agent`, worktree tools
- Depends on: `AgentManager`, `AgentStorage`, `TerminalManager`
- Used by: Bootstrap (HTTP `/mcp/agents` route + in-memory transport for voice agents)

**Relay Layer:**

- Purpose: Cloud relay for remote access when client and daemon are not on the same network
- Location: `packages/relay/src/` (Cloudflare Worker), `packages/server/src/server/relay-transport.ts` (daemon side)
- Contains: E2EE channel using ECDH + AES-GCM, daemon-side reconnect loop, per-client data sockets (v2 protocol)
- Depends on: `@getpaseo/relay` package, daemon keypair (ECDH)
- Used by: `VoiceAssistantWebSocketServer.attachExternalSocket()`

**Client Transport Layer (app-side):**

- Purpose: App-side WebSocket client that speaks the daemon wire protocol
- Location: `packages/server/src/client/daemon-client.ts` (`DaemonClient`)
- Contains: Connection state machine, binary mux decoding, all RPC method wrappers, relay E2EE transport
- Depends on: `packages/server/src/shared/messages.ts` (shared schema), relay crypto
- Used by: `packages/app/src/runtime/host-runtime.ts`

**App Runtime Layer:**

- Purpose: Manages one `DaemonClient` per registered host, syncs agent directory into Zustand store
- Location: `packages/app/src/runtime/host-runtime.ts`
- Contains: Connection probe/selection, reconnect, agent directory sync (`applyFetchedAgentDirectory`)
- Depends on: `DaemonClient`, `useSessionStore`
- Used by: `MultiDaemonSessionHost`, React hooks

**App State Layer:**

- Purpose: Client-side state management via Zustand stores
- Location: `packages/app/src/stores/`
- Contains: `session-store.ts` (agents, streams, permissions), `panel-store.ts` (UI layout), `draft-store.ts`, etc.
- Depends on: Types shared from `@server/` path alias
- Used by: All UI components and hooks

**Shared Schema Layer:**

- Purpose: Types and Zod schemas shared between server and client; single source of truth for wire format
- Location: `packages/server/src/shared/messages.ts`, `packages/server/src/shared/`
- Contains: `WSInboundMessageSchema`, `WSOutboundMessageSchema`, `SessionInboundMessage`, `AgentSnapshotPayload`, binary-mux codec
- Depends on: zod, agent-sdk-types
- Used by: Server session, client `DaemonClient`, app stores

## Data Flow

**Agent Prompt (user → agent):**

1. User types in `packages/app/src/components/message-input.tsx`
2. App calls `DaemonClient.sendMessage()` → WebSocket `session` message → `VoiceAssistantWebSocketServer`
3. `Session.handleMessage()` dispatches to `AgentManager.sendMessage(agentId, prompt)`
4. `AgentManager` invokes the provider's `AgentClient.run()` (e.g., `claude-agent.ts`)
5. Provider streams `AgentStreamEvent`s back to `AgentManager`
6. `AgentManager` fans out to all subscribers; `Session` serializes events → WebSocket → `DaemonClient`
7. `DaemonClient` emits stream events → `host-runtime.ts` applies to `session-store.ts` (Zustand)
8. React components re-render via Zustand subscriptions

**Agent Attention / Push Notification:**

1. Agent finishes or requires permission → `AgentManager.agentAttentionCallback()`
2. `VoiceAssistantWebSocketServer.broadcastAgentAttention()` evaluates client activity states
3. If no active clients: `PushService.sendPush()` to registered Expo push tokens
4. If clients connected: sends `attention_required` stream event per client with computed `shouldNotify`

**Remote Access (Relay Path):**

1. Daemon connects to `relay.paseo.sh:443` as "server" role, presents Ed25519 keypair
2. Client (app) scans QR/link containing `ConnectionOffer` with relay endpoint + daemon public key
3. App connects to relay as "client" role; relay bridges the two connections
4. All traffic is E2EE: ECDH key exchange → AES-GCM encrypted channel
5. Relay forwards encrypted frames; daemon decrypts and routes to `VoiceAssistantWebSocketServer`

**MCP Agent-to-Agent:**

1. Running agent calls Paseo's MCP server via stdio bridge or HTTP (`/mcp/agents`)
2. `AgentMcpServer` tools let agents create, send to, and wait for other agents
3. Uses same `AgentManager` as the WebSocket path — no separate codepath

**State Management:**

- Server: in-memory `AgentManager` (source of truth at runtime), flushed to `AgentStorage` (JSON on disk)
- Client: Zustand `session-store` (agents, streams); TanStack Query for query caching; `host-runtime.ts` owns connection state

## Key Abstractions

**AgentClient (interface):**

- Purpose: Normalized interface each provider must implement to plug into `AgentManager`
- Examples: `packages/server/src/server/agent/providers/claude/claude-agent.ts`, `codex-app-server-agent.ts`, `opencode-agent.ts`
- Pattern: Each provider exports a factory that returns an `AgentClient`; `AgentManager` calls `.run()` and receives `AgentStreamEvent` async iterables

**AgentManager:**

- Purpose: Central registry + lifecycle manager for all running agents across all sessions
- Examples: `packages/server/src/server/agent/agent-manager.ts`
- Pattern: Singleton per daemon process; multiple `Session` objects subscribe to it via pub/sub

**Session:**

- Purpose: Per-WebSocket-client RPC handler; owns all business logic for one connected client
- Examples: `packages/server/src/server/session.ts`
- Pattern: Created by `VoiceAssistantWebSocketServer` for each new connection; dispatches typed messages from `WSInboundMessageSchema`

**DaemonClient:**

- Purpose: App-side mirror of `Session` — all server RPC calls go through it
- Examples: `packages/server/src/client/daemon-client.ts`
- Pattern: Promise-returning methods with internal request/response correlation via `requestId`; binary mux for terminal streaming

**HostProfile / DaemonRegistry:**

- Purpose: Persisted list of known daemon hosts (direct or relay) in the app
- Examples: `packages/app/src/contexts/daemon-registry-context.tsx`
- Pattern: AsyncStorage-backed, exposed via React Context + TanStack Query

**AgentProvider (string enum):**

- Purpose: Discriminates between `"claude"`, `"codex"`, `"opencode"` throughout the codebase
- Examples: `packages/server/src/server/agent/provider-manifest.ts`
- Pattern: `AGENT_PROVIDER_DEFINITIONS` array is the single registry; `AgentProviderSchema` (zod enum) validates wire values

## Entry Points

**Daemon Process:**

- Location: `packages/server/src/server/index.ts`
- Triggers: `npm run start` / `paseo daemon start` / `tsx packages/server/scripts/daemon-runner.ts`
- Responsibilities: Load config, acquire PID lock, call `createPaseoDaemon()`, wire SIGTERM/SIGINT handlers

**Expo App Root:**

- Location: `packages/app/src/app/_layout.tsx`
- Triggers: Expo Router on native/web launch
- Responsibilities: Mount all providers (QueryClient, DaemonRegistry, VoiceProvider, ToastProvider), set up push notification routing, render `Stack` navigator

**CLI:**

- Location: `packages/cli/src/index.ts` / `packages/cli/bin/`
- Triggers: `paseo <command>` or `npm run cli -- <command>`
- Responsibilities: Yargs-based CLI; commands in `src/commands/` (agent/, daemon/, worktree/, speech/, permit/, provider/)

**Desktop (Tauri):**

- Location: `packages/desktop/src-tauri/src/main.rs` + `lib.rs`
- Triggers: Tauri app launch
- Responsibilities: Native shell (zoom, macOS menu, notifications, WebSocket plugin); loads the built Expo web app as webview

**Relay Worker:**

- Location: `packages/relay/src/index.ts` (Cloudflare Worker)
- Triggers: Deployed to Cloudflare Workers at `relay.paseo.sh`
- Responsibilities: WebSocket bridging via Durable Objects, E2EE channel management per client-id

## Error Handling

**Strategy:** Layered — providers catch and emit `error` stream events; `Session` catches unhandled errors and sends `rpc_error` to client; `VoiceAssistantWebSocketServer` logs and sends `status: error`

**Patterns:**

- Agent provider errors become `AgentStreamEvent` of type `error`, streamed to the client like any other event
- RPC errors include `requestId` so the client can reject the correct pending promise
- Daemon startup failures (e.g., PID lock conflict) write to stderr and call `process.exit(1)`
- Relay reconnects automatically with exponential backoff on disconnect

## Cross-Cutting Concerns

**Logging:** `pino` structured JSON logger; `createRootLogger()` in `packages/server/src/server/logger.ts`; child loggers per module via `.child({ module: "..." })`

**Validation:** Zod schemas throughout; shared schemas in `packages/server/src/shared/messages.ts` validated on both send (server) and receive (client via `DaemonClient`)

**Authentication:** No user accounts; pairing uses ECDH `ConnectionOffer` (QR scan or deep link). Direct connections are trusted by network position. Relay uses daemon keypair challenge.

---

_Architecture analysis: 2026-02-21_
