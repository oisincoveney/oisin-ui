# External Integrations

**Analysis Date:** 2026-02-21

## APIs & External Services

**AI Agent Providers:**

- **Claude Code (Anthropic)** - Primary agent provider for coding tasks
  - SDK: `@anthropic-ai/claude-agent-sdk` ^0.2.11
  - Auth: OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) or API key (`ANTHROPIC_API_KEY`) — managed by the `claude` CLI, not by Paseo
  - Implementation: `packages/server/src/server/agent/providers/claude-agent.ts`
  - Modes: `default`, `acceptEdits`, `plan`, `bypassPermissions`

- **OpenAI Codex** - Agent provider for coding tasks
  - SDK: spawns `codex` subprocess, communicates via JSON on stdout/stderr
  - Auth: Managed by `codex` CLI directly
  - Implementation: `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
  - Modes: `read-only`, `auto`, `full-access`

- **OpenCode** - Open-source agent provider
  - SDK: `@opencode-ai/sdk` ^1.1.12 (connects via local socket to `opencode` subprocess)
  - Auth: Managed by `opencode` CLI
  - Implementation: `packages/server/src/server/agent/providers/opencode-agent.ts`
  - Modes: `default`

**AI / LLM APIs:**

- **OpenAI API** - Used for speech (STT, TTS, Realtime transcription) and voice LLM
  - SDK: `openai` ^4.20.0 (direct client), `@ai-sdk/openai` 2.0.52 (Vercel AI SDK provider)
  - Auth: `OPENAI_API_KEY` env var or persisted config `providers.openai.apiKey`
  - Implementation: `packages/server/src/server/speech/providers/openai/`
  - Features used:
    - Whisper STT (`whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`) — `stt.ts`
    - TTS (`tts-1`, `tts-1-hd`, voices: alloy/echo/fable/onyx/nova/shimmer) — `tts.ts`
    - Realtime transcription API (WebSocket, `gpt-4o-transcribe` by default) — `realtime-transcription-session.ts`

- **Vercel AI SDK** - Used to create MCP client in voice sessions
  - SDK: `ai` 5.0.78, `@ai-sdk/openai` 2.0.52
  - Usage: `experimental_createMCPClient` in `packages/server/src/server/session.ts`

## Local AI / On-Device Speech

**Sherpa-ONNX (local STT + TTS):**

- SDK: `sherpa-onnx` ^1.12.23, `sherpa-onnx-node` ^1.12.23
- Runtime: `onnxruntime-node` ^1.23.0
- Supported models: Parakeet (realtime + offline), custom models via `PASEO_LOCAL_MODELS_DIR`
- Implementation: `packages/server/src/server/speech/providers/local/sherpa/`
- Model catalog: `packages/server/src/server/speech/providers/local/models.ts`
- Default STT/TTS provider when OpenAI not configured

**Pocket TTS (ONNX-based):**

- Implementation: `packages/server/src/server/speech/providers/local/pocket/pocket-tts-onnx.ts`
- Alternative local TTS provider

**Deepgram:**

- SDK: `@deepgram/sdk` ^3.4.0 (declared dependency)
- Status: Listed in `packages/server/package.json` but no active usage found in current source. Available for future speech provider integration.

## Push Notifications

**Expo Push Notifications:**

- Endpoint: `https://exp.host/--/api/v2/push/send`
- Auth: None (Expo handles auth by validating push tokens; no API key required from server)
- Implementation: `packages/server/src/server/push/push-service.ts`
- Client registration: `packages/app/src/hooks/use-push-token-registration.ts`
- Token storage: Server-side in `packages/server/src/server/push/token-store.ts`
- Max batch size: 100 tokens per request
- App Project ID: `0e7f65ce-0367-46c8-a238-2b65963d235a` (EAS project, `packages/app/app.config.js`)
- Firebase: Google Services files (production/debug) referenced in `app.config.js` for FCM; injected via `GOOGLE_SERVICES_FILE_PROD` / `GOOGLE_SERVICES_FILE_DEBUG` env vars or `.secrets/` directory

## Relay (Remote Access)

**Cloudflare Workers + Durable Objects:**

- Relay endpoint: `relay.paseo.sh` (custom domain, see `packages/relay/wrangler.toml`)
- Account ID: `10ed39a1dbf316e30abd0c409bed40d6`
- Implementation: `packages/relay/src/cloudflare-adapter.ts` — `RelayDurableObject` class
- Protocol: WebSocket-based multiplexed tunneling with E2EE
- E2EE: Curve25519 key exchange + XSalsa20-Poly1305 encryption via `tweetnacl`
- Server-side relay transport: `packages/server/src/server/relay-transport.ts`
- App connection: `packages/app/src/contexts/daemon-registry-context.tsx`
- Default config: `PASEO_RELAY_ENDPOINT=relay.paseo.sh:443`

## Model Context Protocol (MCP)

**MCP Server (exposed by daemon):**

- SDK: `@modelcontextprotocol/sdk` ^1.20.1
- Implementation: `packages/server/src/server/agent/mcp-server.ts`
- Transport: StreamableHTTP via `StreamableHTTPServerTransport`, stdio via Unix socket bridge
- Bridge command: `packages/server/scripts/mcp-stdio-socket-bridge-cli.mjs`
- Voice MCP bridge: `packages/server/src/server/voice-mcp-bridge.ts` (per-agent Unix socket)

**MCP Client (used in voice sessions):**

- Initialized via `experimental_createMCPClient` from Vercel AI SDK
- `packages/server/src/server/session.ts`

## Expo Application Services (EAS)

**EAS Build:**

- Config: `packages/app/eas.json`
- Profiles: `development`, `production`, `production-apk`
- Triggers: Git tag pushes (`v*`) via EAS workflow `packages/app/.eas/workflows/release-mobile.yml`
- iOS App Store Connect App ID: `6758887924`
- Android: Google Play, `draft` release status on submit

**EAS Updates (OTA):**

- Update URL: `https://u.expo.dev/0e7f65ce-0367-46c8-a238-2b65963d235a`
- Runtime version policy: `appVersion`

## CI/CD & Deployment

**GitHub Actions Workflows (`.github/workflows/`):**

- `server-ci.yml` - Typecheck + test server on push/PR to main
- `desktop-release.yml` - Tauri macOS build on `v*` tag; publishes GitHub Release asset
- `android-apk-release.yml` - EAS APK build on `v*` tag; attaches APK to GitHub Release
- `deploy-relay.yml` - Deploys Cloudflare Worker relay on push to main (relay paths)
- `deploy-website.yml` - Deploys Cloudflare Workers website on push to main (website paths)
- `deploy-app.yml` - Deploys Expo web app to Cloudflare Pages
- `release-notes-sync.yml` - Syncs release notes

**Required Secrets:**

- `CLOUDFLARE_API_TOKEN` - For relay and website deployments
- `EXPO_TOKEN` - For EAS builds
- `GITHUB_TOKEN` - Standard, for release asset uploads and npm GitHub Package Registry

## Data Storage

**Databases:**

- None — no database. All agent and daemon state persisted to local filesystem under `$PASEO_HOME`

**File Storage:**

- Local filesystem: Agent session data at `$PASEO_HOME/agents/{cwd-hash}/{agent-id}.json`
- App: `@react-native-async-storage/async-storage` for daemon registry, preferences, push tokens

**Caching:**

- None

## Authentication & Identity

**Auth Provider:**

- None (no user auth system in Paseo itself)
- Daemon-to-client auth: HTTP Basic Auth (`express-basic-auth`) for daemon HTTP endpoints
- Remote access auth: E2EE keypair — daemon generates keypair at startup (`packages/server/src/server/daemon-keypair.ts`), public key is shared via pairing QR code
- Agent providers (Claude, Codex, OpenCode) authenticate themselves independently via their own CLIs

## Monitoring & Observability

**Error Tracking:**

- None (no external error tracking service detected)

**Logs:**

- `pino` 10.x structured JSON logging on server
- Log level: `PASEO_LOG` env var; format: `PASEO_LOG_FORMAT` env var
- `pino-pretty` for human-readable dev output
- Cloudflare Workers observability enabled in relay (`[observability] enabled = true` in `wrangler.toml`)

## Webhooks & Callbacks

**Incoming:**

- None — clients connect via WebSocket or relay; no inbound webhooks

**Outgoing:**

- Expo Push API (`https://exp.host/--/api/v2/push/send`) — push notifications sent when agent completes tasks

## Environment Configuration

**Required env vars (server):**

- `OPENAI_API_KEY` — for OpenAI speech features (optional if using local speech)
- `PASEO_HOME` — state directory (optional, defaults to `~/.paseo`)
- `PASEO_LISTEN` — server listen address (optional, defaults to `127.0.0.1:6767`)

**Secrets location:**

- Server: env vars or persisted JSON config at `$PASEO_HOME/config.json`
- App: `.secrets/google-services.*.json` + `.secrets/GoogleService-Info.*.plist` (gitignored)
- CI: GitHub Actions secrets

---

_Integration audit: 2026-02-21_
