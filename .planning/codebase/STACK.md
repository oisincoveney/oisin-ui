# Technology Stack

**Analysis Date:** 2026-02-21

## Languages

**Primary:**

- TypeScript 5.9.x - All packages (server, app, relay, website, cli)
- Rust 1.85.1 - Desktop app (`packages/desktop/src-tauri/`)

**Secondary:**

- JavaScript - Config files, scripts, EAS workflow YAML

## Runtime

**Environment:**

- Node.js 22.20.0 (`.tool-versions`)
- Rust/Cargo for Tauri desktop build

**Package Manager:**

- npm workspaces (monorepo)
- Lockfile: `package-lock.json` present at root

## Workspaces

| Package            | Name                | Purpose                                                   |
| ------------------ | ------------------- | --------------------------------------------------------- |
| `packages/server`  | `@getpaseo/server`  | Daemon – agent process manager, WebSocket API, MCP server |
| `packages/app`     | `@getpaseo/app`     | Cross-platform mobile/web client (Expo)                   |
| `packages/relay`   | `@getpaseo/relay`   | E2EE relay library + Cloudflare Workers adapter           |
| `packages/desktop` | `@getpaseo/desktop` | Tauri desktop wrapper (macOS/Win/Linux)                   |
| `packages/cli`     | `@getpaseo/cli`     | `paseo` CLI tool                                          |
| `packages/website` | `@getpaseo/website` | Marketing site at paseo.sh                                |

## Frameworks

**Server (`packages/server`):**

- Express 4.x - HTTP server and REST endpoints
- `ws` 8.x - Native WebSocket server
- `@modelcontextprotocol/sdk` ^1.20.1 - MCP server/client implementation
- Vitest 3.x - Unit testing
- Playwright 1.56.x - E2E testing

**App (`packages/app`):**

- Expo 54.x - Cross-platform React Native framework
- React 19.1.0 / React Native 0.81.x
- Expo Router 6.x - File-based navigation
- `@react-navigation/native` 7.x - Navigation primitives
- `@tanstack/react-query` 5.x - Server state management
- Zustand 5.x - Local/global state management
- `react-native-reanimated` 4.x - Animations
- `react-native-unistyles` 3.x - Theming system
- `@gorhom/bottom-sheet` 5.x - Bottom sheet modals
- `@dnd-kit/core` 6.x / `@dnd-kit/sortable` 10.x - Drag-and-drop
- Vitest 3.x - Unit testing
- Playwright 1.56.x - E2E testing

**Relay (`packages/relay`):**

- Cloudflare Workers + Durable Objects - Relay server deployment
- `tweetnacl` 1.x - E2EE (Curve25519 key exchange, XSalsa20-Poly1305 encryption)
- `ws` 8.x - Node.js WebSocket adapter
- Vitest 3.x - Unit testing

**Website (`packages/website`):**

- Vite 7.x - Build tool
- TanStack Router 1.x + TanStack Start 1.x - File-based routing
- React 19.1.0
- Tailwind CSS 4.x - Styling
- Cloudflare Workers - Deployment target (`wrangler deploy`)

**Desktop (`packages/desktop`):**

- Tauri 2.x - Native wrapper around the Expo web build
- Rust: `tauri`, `tauri-plugin-dialog`, `tauri-plugin-log`, `tauri-plugin-notification`, `tauri-plugin-opener`, `tauri-plugin-websocket`

**CLI (`packages/cli`):**

- `commander` 12.x - Command parsing
- `@clack/prompts` 1.x - Interactive prompts
- `chalk` 5.x - Terminal colors
- `yaml` 2.x - Config parsing

## Key Dependencies

**AI/Agent SDKs:**

- `@anthropic-ai/claude-agent-sdk` ^0.2.11 - Drives Claude Code agent sessions (root + server)
- `openai` ^4.20.0 - OpenAI API client (speech: Whisper STT, TTS, Realtime transcription)
- `@ai-sdk/openai` 2.0.52 - Vercel AI SDK OpenAI provider
- `ai` 5.0.78 - Vercel AI SDK core (used for MCP client: `experimental_createMCPClient`)
- `@opencode-ai/sdk` ^1.1.12 - OpenCode agent client

**Speech / Local ML:**

- `sherpa-onnx` ^1.12.23 + `sherpa-onnx-node` ^1.12.23 - Local STT (Parakeet, streaming/offline) and TTS
- `onnxruntime-node` ^1.23.0 - ONNX model inference runtime
- `@sctg/sentencepiece-js` ^1.1.0 - Tokenization for local speech models
- `@deepgram/sdk` ^3.4.0 - Deepgram STT (declared dependency; usage not active in current code paths)

**Terminal:**

- `node-pty` 1.2.0-beta.11 - Pseudoterminal spawning (`packages/server/src/terminal/terminal.ts`)
- `@xterm/headless` ^6.0.0 - Headless terminal for server-side output parsing
- `@xterm/xterm` ^6.0.0 + `@xterm/addon-fit` - Full terminal emulator in app

**Syntax Highlighting:**

- `@lezer/*` family (common, css, html, javascript, json, markdown, python, highlight) + `lezer-elixir` - Code parsing for rich tool-call display

**Infrastructure:**

- `pino` 10.x + `pino-pretty` - Structured JSON logging (server)
- `zod` ^3.23.8 - Schema validation (all packages)
- `express-basic-auth` - HTTP Basic Auth middleware for daemon
- `uuid` ^9.0.1 - ID generation
- `mnemonic-id` ^3.2.7 - Human-readable agent IDs
- `qrcode` ^1.5.4 - QR code generation for pairing

**App-specific:**

- `@boudra/expo-two-way-audio` ^0.1.3 - Custom native audio module for voice I/O
- `expo-notifications` ^0.32.16 - Push notification integration
- `@react-native-async-storage/async-storage` 2.2.0 - Persistent local storage
- `react-native-nitro-modules` ^0.30.0 - Native module bridge
- `@floating-ui/react-native` - Popover/tooltip positioning

## Configuration

**Environment (Server):**

- `OPENAI_API_KEY` - OpenAI speech API key
- `PASEO_HOME` - Runtime state directory (default: `~/.paseo`)
- `PASEO_LISTEN` - Listen address (default: `127.0.0.1:6767`)
- `PASEO_RELAY_ENDPOINT` - Relay server (default: `relay.paseo.sh:443`)
- `PASEO_APP_BASE_URL` - App base URL (default: `https://app.paseo.sh`)
- `PASEO_DICTATION_STT_PROVIDER` / `PASEO_VOICE_STT_PROVIDER` / `PASEO_VOICE_TTS_PROVIDER` - Speech provider selection (`local` or `openai`)
- `PASEO_DICTATION_ENABLED` / `PASEO_VOICE_MODE_ENABLED` - Feature flags
- `PASEO_LOG` / `PASEO_LOG_FORMAT` - Log level and format
- `PASEO_CORS_ORIGINS` - Allowed CORS origins
- `PASEO_ALLOWED_HOSTS` - Allowed host whitelist
- `PASEO_LOCAL_MODELS_DIR` - Local ML model directory
- See `packages/server/.env.example` for full list

**App Variants:**

- `APP_VARIANT=production` → `sh.paseo` / "Paseo"
- `APP_VARIANT=development` → `sh.paseo.debug` / "Paseo Debug"
- Configured in `packages/app/app.config.js`

**Build:**

- `tsconfig.base.json` - Shared TypeScript config (target: ES2020, strict: true, moduleResolution: bundler)
- Each package has its own `tsconfig.json` extending base
- Prettier config: `.prettierrc` (no semi, single quotes, trailing commas, 2-space indent, 100 char width)

## Platform Requirements

**Development:**

- Node.js 22.20.0
- Rust 1.85.1 (for desktop builds)
- `tsx` for running TypeScript scripts without build
- For iOS: Xcode + CocoaPods
- For Android: Android SDK (minSdkVersion 29)

**Production Targets:**

- Server: Node.js daemon on macOS/Linux, distributed as npm package `@getpaseo/server`
- App: iOS (App Store), Android (Google Play + APK sideload), Web (Cloudflare Pages via `wrangler`)
- Desktop: macOS (aarch64), built via Tauri on GitHub Actions
- Relay: Cloudflare Workers (Durable Objects) at `relay.paseo.sh`
- Website: Cloudflare Workers at `paseo.sh`

---

_Stack analysis: 2026-02-21_
