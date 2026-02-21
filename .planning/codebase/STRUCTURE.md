# Codebase Structure

**Analysis Date:** 2026-02-21

## Directory Layout

```
paseo/                              # Monorepo root
├── packages/
│   ├── server/                     # Daemon process (Node.js/TypeScript)
│   ├── app/                        # Cross-platform client (Expo/React Native)
│   ├── cli/                        # `paseo` CLI (Node.js/TypeScript)
│   ├── relay/                      # Cloud relay (Cloudflare Worker)
│   ├── desktop/                    # Desktop shell (Tauri/Rust wrapping Expo web)
│   └── website/                    # Marketing site (TanStack Router + CF Workers)
├── scripts/                        # Monorepo tooling (release, version sync, patches)
├── patches/                        # patch-package patches for npm dependencies
├── docs/                           # Internal documentation
├── .planning/                      # GSD planning artifacts
│   └── codebase/                   # Codebase analysis documents
├── .github/workflows/              # CI/CD GitHub Actions
└── package.json                    # Workspace root (npm workspaces)
```

## Package Internals

### packages/server/

```
packages/server/
├── src/
│   ├── server/                     # Daemon core
│   │   ├── index.ts                # Entry point (main())
│   │   ├── bootstrap.ts            # Wires all subsystems; createPaseoDaemon()
│   │   ├── websocket-server.ts     # VoiceAssistantWebSocketServer
│   │   ├── session.ts              # Per-client RPC handler (~6800 lines)
│   │   ├── messages.ts             # Re-exports + server-side serializers
│   │   ├── config.ts               # loadConfig() from env + persisted config
│   │   ├── logger.ts               # pino root logger factory
│   │   ├── agent/                  # Agent management subsystem
│   │   │   ├── agent-manager.ts    # AgentManager class
│   │   │   ├── agent-storage.ts    # AgentStorage (JSON on disk)
│   │   │   ├── agent-sdk-types.ts  # Shared type definitions (AgentClient, etc.)
│   │   │   ├── provider-manifest.ts # AGENT_PROVIDER_DEFINITIONS registry
│   │   │   ├── provider-registry.ts # Factory: createAllClients()
│   │   │   ├── mcp-server.ts       # MCP tool server for agent-to-agent calls
│   │   │   ├── agent-projections.ts # toAgentPayload() serializer
│   │   │   ├── timeline-projection.ts # Timeline windowing/pagination
│   │   │   ├── agent-response-loop.ts # LLM response generation loop
│   │   │   ├── agent-metadata-generator.ts # Auto-title generation
│   │   │   ├── tts-manager.ts      # Text-to-speech session manager
│   │   │   ├── stt-manager.ts      # Speech-to-text session manager
│   │   │   └── providers/
│   │   │       ├── claude/         # Claude Code provider adapter
│   │   │       ├── codex/          # Codex provider adapter
│   │   │       └── opencode/       # OpenCode provider adapter
│   │   ├── speech/                 # Speech runtime (STT/TTS)
│   │   │   ├── speech-runtime.ts   # initializeSpeechRuntime()
│   │   │   ├── speech-provider.ts  # Provider interfaces
│   │   │   └── providers/
│   │   │       ├── openai/         # OpenAI Realtime API
│   │   │       └── local/          # Local speech (Whisper/Sherpa/Pocket)
│   │   ├── push/                   # Push notification service
│   │   │   ├── push-service.ts     # Expo push delivery
│   │   │   └── token-store.ts      # Persisted push tokens
│   │   ├── dictation/              # Dictation streaming manager
│   │   ├── file-explorer/          # Directory listing + file read
│   │   ├── file-download/          # Tokenized file download
│   │   ├── terminal-mcp/           # Terminal MCP bridge
│   │   └── daemon-e2e/             # E2E test helpers
│   ├── client/                     # DaemonClient (used by app + CLI)
│   │   ├── daemon-client.ts        # Main client class
│   │   ├── daemon-client-transport.ts        # Transport abstraction
│   │   ├── daemon-client-websocket-transport.ts # Direct WS transport
│   │   ├── daemon-client-relay-e2ee-transport.ts # Relay+E2EE transport
│   │   └── daemon-client-terminal-stream-manager.ts # Terminal binary stream
│   ├── shared/                     # Shared types/schemas (server + client)
│   │   ├── messages.ts             # Wire protocol schemas (Zod + types)
│   │   ├── binary-mux.ts           # Binary multiplexing codec
│   │   ├── agent-lifecycle.ts      # Agent status enum
│   │   ├── connection-offer.ts     # Pairing offer schema
│   │   └── daemon-endpoints.ts     # URL builders
│   ├── terminal/                   # PTY terminal management
│   │   ├── terminal-manager.ts     # TerminalManager
│   │   └── terminal.ts             # TerminalSession (node-pty)
│   └── utils/                      # Shared server utilities
├── scripts/                        # Build/runtime scripts
│   ├── daemon-runner.ts            # Dev mode runner
│   └── mcp-stdio-socket-bridge-cli.mjs # MCP stdio bridge for voice agents
└── package.json                    # @getpaseo/server
```

### packages/app/

```
packages/app/
├── src/
│   ├── app/                        # Expo Router file-based routes
│   │   ├── _layout.tsx             # Root layout + all providers
│   │   ├── index.tsx               # Home screen (redirect/welcome)
│   │   ├── pair-scan.tsx           # QR pairing screen
│   │   └── h/[serverId]/           # Per-host routes
│   │       ├── index.tsx           # Host home
│   │       ├── agents.tsx          # Agent list screen
│   │       ├── settings.tsx        # Host settings
│   │       └── agent/
│   │           ├── index.tsx       # New agent draft
│   │           └── [agentId].tsx   # Agent view
│   ├── screens/agent/              # Screen-level components
│   │   ├── agent-ready-screen.tsx  # Active agent UI
│   │   ├── draft-agent-screen.tsx  # Pre-launch agent form
│   │   └── legacy-agent-id-screen.tsx
│   ├── components/                 # Reusable UI components
│   │   ├── agent-stream-view.tsx   # Agent output renderer
│   │   ├── message-input.tsx       # Input bar
│   │   ├── left-sidebar.tsx        # Agent list sidebar
│   │   ├── terminal-emulator.tsx   # xterm.js terminal
│   │   ├── multi-daemon-session-host.tsx # Mounts one SessionProvider per host
│   │   ├── agent-form/             # Agent creation form components
│   │   ├── headers/                # Navigation header components
│   │   ├── icons/                  # Icon components
│   │   └── ui/                     # Design system primitives
│   ├── contexts/                   # React Context providers
│   │   ├── daemon-registry-context.tsx  # HostProfile registry (AsyncStorage)
│   │   ├── session-context.tsx     # Per-host session state
│   │   ├── voice-context.tsx       # Voice/realtime API context
│   │   ├── toast-context.tsx       # Toast notifications
│   │   ├── sidebar-animation-context.tsx
│   │   └── horizontal-scroll-context.tsx
│   ├── stores/                     # Zustand stores
│   │   ├── session-store.ts        # Agents + stream items (main state store)
│   │   ├── panel-store.ts          # UI layout (sidebar, panels)
│   │   ├── draft-store.ts          # Agent creation draft
│   │   └── ...                     # Other UI state stores
│   ├── runtime/
│   │   └── host-runtime.ts         # Per-host DaemonClient lifecycle + agent sync
│   ├── hooks/                      # React hooks
│   │   ├── use-agent-screen-state-machine.ts # Agent view state machine
│   │   ├── use-dictation.ts        # Dictation integration
│   │   └── ...                     # ~50 hooks total
│   ├── query/
│   │   └── query-client.ts         # TanStack Query client singleton
│   ├── types/                      # App-local TypeScript types
│   ├── utils/                      # App utilities
│   ├── constants/                  # Layout, platform constants
│   ├── config/                     # App-level configuration
│   ├── styles/                     # Unistyles theme + global styles
│   ├── voice/                      # Voice/dictation audio processing
│   ├── dictation/                  # Dictation state management
│   ├── terminal/runtime/           # Terminal client runtime
│   ├── lib/                        # Third-party integrations
│   ├── keyboard/                   # Keyboard handling
│   └── polyfills/                  # Platform polyfills (crypto, etc.)
├── assets/                         # Images, icons
├── e2e/                            # Playwright E2E tests
├── maestro/                        # Maestro mobile E2E flows
└── package.json                    # @getpaseo/app
```

### packages/cli/

```
packages/cli/
├── src/
│   ├── index.ts                    # CLI entry point (yargs)
│   ├── cli.ts                      # Root yargs setup
│   ├── commands/
│   │   ├── agent/                  # Agent subcommands
│   │   │   ├── ls.ts               # List agents
│   │   │   ├── run.ts              # Start agent
│   │   │   ├── logs.ts             # Stream agent logs
│   │   │   ├── inspect.ts          # Agent details
│   │   │   ├── send.ts             # Send message to agent
│   │   │   ├── wait.ts             # Wait for agent to finish
│   │   │   ├── stop.ts             # Stop agent
│   │   │   ├── archive.ts          # Archive agent
│   │   │   ├── attach.ts           # Attach to agent output
│   │   │   ├── mode.ts             # Change agent mode
│   │   │   └── update.ts           # Update agent settings
│   │   ├── daemon/                 # Daemon management subcommands
│   │   │   ├── start.ts            # Start daemon
│   │   │   ├── stop.ts             # Stop daemon
│   │   │   ├── status.ts           # Daemon status
│   │   │   ├── restart.ts          # Restart daemon
│   │   │   ├── pair.ts             # Generate pairing QR
│   │   │   └── local-daemon.ts     # Local daemon runner util
│   │   ├── worktree/               # Git worktree commands
│   │   ├── speech/                 # Speech model management
│   │   ├── permit/                 # Permission management
│   │   ├── provider/               # Agent provider commands
│   │   └── onboard.ts              # First-run setup
│   ├── output/                     # CLI output formatters
│   └── utils/                      # CLI utilities
├── bin/                            # Executable entry points
└── package.json                    # @getpaseo/cli
```

### packages/relay/

```
packages/relay/
├── src/
│   ├── index.ts                    # Cloudflare Worker entry point
│   ├── cloudflare-adapter.ts       # CF-specific WebSocket/DO adapter
│   ├── node-adapter.ts             # Node.js adapter (for tests)
│   ├── e2ee.ts                     # E2EE channel implementation
│   ├── encrypted-channel.ts        # AES-GCM encrypted WebSocket channel
│   ├── crypto.ts                   # ECDH key exchange primitives
│   ├── types.ts                    # RelaySessionAttachment, ConnectionRole
│   └── base64.ts                   # Base64 utilities
└── package.json                    # @getpaseo/relay
```

### packages/desktop/

```
packages/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri entry point
│   │   └── lib.rs                  # Menu, zoom, notifications, plugin setup
│   ├── tauri.conf.json             # Tauri app configuration
│   ├── Cargo.toml                  # Rust dependencies
│   └── capabilities/               # Tauri permission declarations
└── package.json                    # @getpaseo/desktop
```

## Key File Locations

**Entry Points:**

- `packages/server/src/server/index.ts`: Daemon main() — start here to understand daemon startup
- `packages/app/src/app/_layout.tsx`: Expo app root — all providers mounted here
- `packages/cli/src/index.ts`: CLI entry — yargs commands registered here
- `packages/relay/src/index.ts`: Cloudflare Worker entry for relay service

**Configuration:**

- `packages/server/src/server/config.ts`: `loadConfig()` — all daemon config from env/persisted
- `packages/server/src/server/persisted-config.ts`: Persisted config schema (`$PASEO_HOME/config.json`)
- `packages/server/src/server/agent/provider-manifest.ts`: Agent provider registry (add new providers here)
- `packages/app/src/config/`: App-level configuration constants
- `packages/app/src/constants/layout.ts`: Platform detection (`getIsTauri()`, `getIsTauriMac()`)

**Core Logic:**

- `packages/server/src/server/bootstrap.ts`: Daemon wiring — understand all subsystem connections
- `packages/server/src/server/session.ts`: All server-side RPC handlers — where features are implemented
- `packages/server/src/server/websocket-server.ts`: Connection management, attention/push dispatch
- `packages/server/src/server/agent/agent-manager.ts`: Agent lifecycle management
- `packages/server/src/client/daemon-client.ts`: App-side client API — all methods available to app
- `packages/app/src/runtime/host-runtime.ts`: App connection lifecycle + agent directory sync
- `packages/app/src/stores/session-store.ts`: Main app state (agents, streams, permissions)

**Shared Schema:**

- `packages/server/src/shared/messages.ts`: Wire protocol types — modify when adding new message types
- `packages/server/src/server/agent/agent-sdk-types.ts`: Core agent types shared across layers

**Testing:**

- `packages/server/src/server/agent/*.test.ts`: Unit tests co-located with source
- `packages/server/src/server/*.e2e.test.ts`: E2E tests requiring daemon process
- `packages/cli/tests/e2e/`: CLI E2E tests
- `packages/app/e2e/`: Playwright web E2E tests
- `packages/app/maestro/flows/`: Maestro mobile flow tests

## Naming Conventions

**Files:**

- `kebab-case.ts` for all TypeScript files
- `.test.ts` suffix for unit tests (co-located with source)
- `.e2e.test.ts` suffix for E2E tests
- Platform-specific files use `.native.ts`, `.web.ts` suffixes (Expo platform splitting)
- Type declaration files use `.d.ts` (e.g., `use-audio-player.d.ts`)

**Directories:**

- `kebab-case` for all directories
- Feature subsystems get their own subdirectory under `src/server/` (e.g., `push/`, `speech/`, `dictation/`)
- Provider adapters live under `providers/` subdirectory

**Components:**

- `PascalCase` for React components
- `kebab-case` for component files (e.g., `agent-stream-view.tsx`)
- Hook files prefix with `use-` (e.g., `use-dictation.ts`)

**Classes/Interfaces:**

- `PascalCase` for classes and interfaces (e.g., `AgentManager`, `DaemonClient`)
- `camelCase` for functions and methods
- `SCREAMING_SNAKE_CASE` for constants (e.g., `AGENT_PROVIDER_IDS`)

## Where to Add New Code

**New Agent Provider:**

- Provider adapter: `packages/server/src/server/agent/providers/{name}/{name}-agent.ts`
- Register in manifest: `packages/server/src/server/agent/provider-manifest.ts` → `AGENT_PROVIDER_DEFINITIONS`
- Factory in: `packages/server/src/server/agent/provider-registry.ts`

**New Session RPC Handler:**

- Add message type to: `packages/server/src/shared/messages.ts` (`WSInboundMessageSchema`)
- Handle in: `packages/server/src/server/session.ts` (`handleMessage()` dispatch)
- Add client method to: `packages/server/src/client/daemon-client.ts`

**New UI Screen:**

- Route file: `packages/app/src/app/h/[serverId]/` or `packages/app/src/app/`
- Screen component: `packages/app/src/screens/`
- Register route in layout: `packages/app/src/app/_layout.tsx` (`Stack.Screen`)

**New UI Component:**

- General: `packages/app/src/components/{component-name}.tsx`
- Platform-split: `{name}.tsx` (shared), `{name}.native.tsx`, `{name}.web.tsx`

**New Hook:**

- `packages/app/src/hooks/use-{name}.ts`

**New Zustand Store:**

- `packages/app/src/stores/{name}-store.ts`
- Export via named exports; use `create()` from `zustand`

**New Server Utility:**

- Shared (server+client): `packages/server/src/shared/`
- Server-only: `packages/server/src/utils/` or `packages/server/src/server/utils/`

**New CLI Command:**

- Subcommand of existing group: `packages/cli/src/commands/{group}/{command}.ts`
- Register in: `packages/cli/src/commands/{group}/index.ts`

## Special Directories

**`packages/server/src/shared/`:**

- Purpose: Types and schemas imported by both server and client (app/CLI)
- Generated: No — hand-authored
- Committed: Yes — source of truth for wire protocol

**`packages/server/src/client/`:**

- Purpose: The `DaemonClient` used by both the app (`@server/client/daemon-client`) and CLI
- Generated: No
- Committed: Yes

**`packages/relay/.wrangler/`:**

- Purpose: Wrangler local dev state (Cloudflare emulator)
- Generated: Yes
- Committed: No (gitignored)

**`packages/app/src/app/`:**

- Purpose: Expo Router file-based routing — file names ARE the routes
- Generated: Partially (`routeTree.gen.ts` in website is generated; app routes are hand-authored)
- Committed: Yes

**`packages/desktop/src-tauri/target/`:**

- Purpose: Rust build artifacts
- Generated: Yes
- Committed: No (gitignored)

**`.planning/`:**

- Purpose: GSD planning artifacts (phase plans, codebase analysis)
- Generated: Yes (by GSD commands)
- Committed: Yes

**`patches/`:**

- Purpose: patch-package patches applied via `postinstall` script
- Generated: No — hand-authored
- Committed: Yes

---

_Structure analysis: 2026-02-21_
