# Codebase Concerns

**Analysis Date:** 2026-02-21

## Tech Debt

**Deprecated `PROVIDER_REGISTRY` constant:**

- Issue: `PROVIDER_REGISTRY` is exported as `null as any` — a typed null disguised as a valid object. The comment says "Deprecated: Use buildProviderRegistry instead" but the export remains.
- Files: `packages/server/src/server/agent/provider-registry.ts:79`
- Impact: Any accidental use of this exported value at runtime will fail with a null dereference without TypeScript catching it (the `as any` defeats type checking).
- Fix approach: Remove the export entirely; confirm no callers exist via grep — currently only the defining file contains the symbol.

**Orchestration E2E test is a placeholder:**

- Issue: The entire `multi-agent orchestration` describe block was replaced with a single passing placeholder test when the old agent-control MCP was removed.
- Files: `packages/server/src/server/daemon-e2e/orchestration.e2e.test.ts:26`
- Impact: Multi-agent orchestration has zero automated coverage.
- Fix approach: Re-implement tests against the new Paseo MCP once the feature is stable.

**`OpenCode.listPersistedAgents` is unimplemented:**

- Issue: Returns an empty array with a TODO comment. Paseo will never surface persisted OpenCode agents in the UI.
- Files: `packages/server/src/server/agent/providers/opencode-agent.ts:507`
- Impact: OpenCode agents are invisible after daemon restart; no session recovery.
- Fix approach: Implement by listing sessions from the OpenCode HTTP API (`/session/list` or equivalent).

**Temporary `ACTIVE_GRACE_PERIOD_MS` value (2 days, marked "for screenshots"):**

- Issue: The constant comment reads `// 2 days (temporary for screenshots)`. The intended value in the docstring says "24 hours" but the actual value is 48 hours.
- Files: `packages/app/src/utils/agent-grouping.ts:211`
- Impact: Agents remain in the "active" sidebar section far longer than intended, inflating the active list.
- Fix approach: Decide the correct grace period and remove the "temporary" qualifier.

**POC commands committed to main codebase:**

- Issue: `packages/server/src/poc-commands/` contains proof-of-concept investigation scripts (`run-poc.ts`, `investigate-command-output.ts`, `commands-poc.test.ts`) that are not part of any build output or npm script.
- Files: `packages/server/src/poc-commands/`
- Impact: Dead code adds maintenance surface and confuses contributors.
- Fix approach: Delete the directory and its files.

**`expo-file-system/legacy` import for downloads:**

- Issue: `download-store.ts` imports from `expo-file-system/legacy` using `LegacyFileSystem.createDownloadResumable`. The legacy API is deprecated and will be removed in a future Expo SDK.
- Files: `packages/app/src/stores/download-store.ts:4`
- Impact: Will break when Expo removes the legacy API. Resumable downloads may also have correctness issues on the new API.
- Fix approach: Migrate to the current `expo-file-system` download API (`FileSystem.downloadAsync` or the new streaming API in SDK 54+).

**Legacy theme color aliases pending migration:**

- Issue: Both `lightSemanticColors` and `darkSemanticColors` in `theme.ts` contain a "Legacy aliases (for gradual migration)" section duplicating semantic tokens under old names (`background`, `card`, `popover`, etc.).
- Files: `packages/app/src/styles/theme.ts:132`, `packages/app/src/styles/theme.ts:174`
- Impact: Every consumer of these legacy names is a potential migration target. The dual-naming adds confusion.
- Fix approach: Audit all usage of legacy token names and migrate to the new surface/foreground tokens; then remove the aliases.

**Settings screen uses deprecated `Constants.manifest` API:**

- Issue: Version is read via `(Constants as any).manifest?.version` — an `@ts-ignore`-equivalent cast to bypass type errors on the deprecated property.
- Files: `packages/app/src/screens/settings-screen.tsx:429`
- Impact: `Constants.manifest` is removed in newer Expo SDK versions; the fallback silently returns null when it fails.
- Fix approach: Use `Constants.expoConfig?.version` (already attempted on the line above based on the surrounding code), and remove the legacy fallback.

---

## Known Bugs / Workarounds

**Expo SDK 54 Android audio recorder URI bug:**

- Symptoms: `audioRecorder.uri` returns an empty or zero-byte file path on Android.
- Files: `packages/app/src/hooks/use-audio-recorder.native.ts:16`, `:283`
- Trigger: Recording audio on Android with Expo SDK 54.
- Workaround: A file-system scan finds the actual recording file by scanning the temp directory. Marked explicitly as a workaround.
- Fix path: Upgrade to Expo SDK 55+ if the upstream bug is fixed, or switch to the new audio API.

**Audio player engine needs resume-before-play on native:**

- Symptoms: Audio engine is not ready when a new segment starts; audio is dropped.
- Files: `packages/app/src/hooks/use-audio-player.native.ts:230`
- Trigger: Playing audio segments during voice interactions on native.
- Workaround: `resume()` is called before `play()` to warm the engine.

**Terminal settle-time is a hardcoded 1-second debounce:**

- Issue: `settleTime = 1000` is noted as "Hardcoded debounce" with no configurability.
- Files: `packages/server/src/server/terminal-mcp/tmux.ts:1168`
- Impact: Slow machines may not settle within 1 s; fast machines waste time.
- Fix approach: Make configurable or use smarter idle detection.

---

## Security Considerations

**File explorer path traversal — protected but review on agent CWD mutations:**

- Risk: The file explorer's `resolveScopedPath` correctly rejects paths that escape the agent's CWD (returns error "Access outside of agent workspace is not allowed"). However, the check relies on the `agent.cwd` value set at agent creation. If CWD is mutated server-side after creation, the boundary could shift.
- Files: `packages/server/src/server/file-explorer/service.ts:222-238`, `packages/server/src/server/session.ts:4683`
- Current mitigation: `resolveScopedPath` uses `path.resolve` + `path.relative` to detect `..` escapes.
- Recommendations: Add tests that explicitly validate traversal attempts with symlink targets and unusual paths.

**WebSocket server relies on origin/host allowlist — no authentication token:**

- Risk: The WebSocket server rejects connections based on origin and host headers but does not require a token or shared secret from connecting clients. Any process on an allowed host can connect.
- Files: `packages/server/src/server/websocket-server.ts:281-301`, `packages/server/src/server/allowed-hosts.ts`
- Current mitigation: Daemon listens on `127.0.0.1` by default; relay transport uses signed keypair authentication (`daemon-keypair.ts`).
- Recommendations: Local-only connections rely entirely on network isolation. Consider adding an optional token auth mode for multi-user machines.

**Download token is single-use but MIME type is trusted from disk at issue time:**

- Risk: Download token is consumed on first use (good), but MIME type and file path are frozen at token issuance. If the file changes between issuance and download, the stale metadata is served.
- Files: `packages/server/src/server/bootstrap.ts:225-255`, `packages/server/src/server/file-download/token-store.ts`
- Current mitigation: Token is consumed immediately; a stat check is done at download time before streaming.
- Recommendations: Low risk given single-use consumption; no action needed unless token TTL is extended.

**`as any` casts bypass type safety in relay transport JSON parsing:**

- Risk: `relay-transport.ts:49` does `JSON.parse(text) as any` then accesses properties without schema validation. A malformed control message would silently return `null` (handled), but a crafted message that passes the shape check could manipulate state.
- Files: `packages/server/src/server/relay-transport.ts:45-67`
- Current mitigation: `tryParseControlMessage` validates `type` and required fields before returning.
- Recommendations: Add Zod schema validation for control messages instead of manual property checks.

---

## Performance Bottlenecks

**`session.ts` is a 6,778-line God Object:**

- Problem: The `Session` class handles WebSocket connection lifecycle, all agent CRUD operations, file explorer requests, terminal management, voice/STT/TTS, MCP client, git operations, and push notifications.
- Files: `packages/server/src/server/session.ts` (6,778 lines, ~115 function definitions)
- Cause: Incremental feature addition into a single class with no decomposition.
- Impact: Hard to reason about, impossible to unit test in isolation, high merge conflict risk. Startup initialization is sequential and complex.
- Improvement path: Extract discrete managers (FileManager, VoiceManager, GitManager, etc.) that the Session delegates to — similar to how AgentManager was already extracted.

**Provider agent files are extremely large:**

- Problem: `codex-app-server-agent.ts` is 3,198 lines and `claude-agent.ts` is 2,848 lines — each is a monolithic implementation with many internal classes and helpers.
- Files: `packages/server/src/server/agent/providers/codex-app-server-agent.ts`, `packages/server/src/server/agent/providers/claude-agent.ts`
- Cause: All provider logic (client, session, history parsing, tool call mapping, timeline projection) is colocated.
- Improvement path: Split each provider into a directory with separate files for client, session, history parsing, and tool call mapping (Claude already has `packages/server/src/server/agent/providers/claude/` sub-files for tool-call helpers).

**`session-context.tsx` is 1,638 lines with heavy state in a single React context:**

- Problem: All WebSocket message handling, agent state, explorer state, timeline responses, and voice interaction live in one context. Re-renders in any part trigger all consumers.
- Files: `packages/app/src/contexts/session-context.tsx`
- Cause: Monolithic context grew from simple WebSocket wrapper.
- Impact: UI performance degrades as agent count and message volume increase; difficult to memoize effectively.
- Improvement path: Split into domain-specific contexts (AgentContext, ExplorerContext, VoiceContext) with selective subscriptions, or migrate state to the existing Zustand stores.

---

## Fragile Areas

**OpenCode server uses a global process-level singleton with static exit handler:**

- Files: `packages/server/src/server/agent/providers/opencode-agent.ts:217-264`
- Why fragile: `OpenCodeServerManager.getInstance()` is a static singleton with a one-time exit handler. If settings change after first initialization, the new settings are silently ignored (logged as a warning only). The exit handler is registered once via a static flag — if the module is unloaded and reloaded (in tests), the flag is stale.
- Safe modification: Always check `OpenCodeServerManager.instance` before mutating static state; in tests, reset `OpenCodeServerManager.instance = null` between suites.
- Test coverage: Not directly unit tested; covered only via integration tests.

**Terminal e2e tests disabled on CI:**

- Files: `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts:45`
- Why fragile: `const shouldRun = !process.env.CI` skips the entire terminal e2e suite in CI. Regressions in terminal attach/detach, PTY lifecycle, and binary mux framing will not be caught automatically.
- Safe modification: Treat terminal tests as always potentially broken on CI; run manually before terminal-related releases.
- Test coverage: Zero automated terminal coverage on CI.

**`experimental_createMCPClient` from AI SDK:**

- Files: `packages/server/src/server/session.ts:52`, `:818`
- Why fragile: The `experimental_` prefix indicates the API is unstable. AI SDK 5.x (`ai@5.0.78`) is pinned but may change the MCP client API in patch releases.
- Safe modification: When upgrading the `ai` package, verify `experimental_createMCPClient` signature has not changed.
- Test coverage: Not unit tested; exercised through full E2E daemon tests.

**Router navigation uses pervasive `as any` casts:**

- Files: `packages/app/src/app/_layout.tsx:86,122,350,352`, `packages/app/src/app/pair-scan.tsx:173,181,189,201,208,211`, `packages/app/src/screens/agent/agent-ready-screen.tsx:157,160,589`, and ~15 other locations.
- Why fragile: All `router.replace()` and `router.push()` calls cast the route string `as any` to bypass Expo Router's typed route system. Renaming or removing a route file will not produce a TypeScript error.
- Safe modification: When renaming route files, manually search for all string literals passed to `router.replace`/`router.push`; the TypeScript compiler will not catch stale references.
- Fix approach: Enable Expo Router's typed routes feature and remove the `as any` casts — the route builders in `packages/app/src/utils/host-routes.ts` are already correct, they just need to return typed route objects.

**`session-context.tsx` uses `any` for explorer state updates:**

- Files: `packages/app/src/contexts/session-context.tsx:522,1474,1489,1490,1509,1523,1532,1533,1551,1572,1598,1599,1618`
- Why fragile: The `updateExplorerState` callback is typed as `(state: any) => any`, making all explorer state mutations untyped. Type errors in state shape will only appear at runtime.
- Safe modification: Add an explicit `ExplorerState` interface and replace the `any` signatures.

---

## Scaling Limits

**Push token store is a flat JSON file:**

- Current capacity: Unlimited tokens in a JSON file read on every push send.
- Limit: As token count grows (many devices per user), the file read + parse + batch operation becomes a bottleneck.
- Files: `packages/server/src/server/push/token-store.ts`, `packages/server/src/server/push/push-service.ts:54`
- Scaling path: In practice, one daemon serves one user with a handful of devices; this is unlikely to be a real issue. No action needed for current use case.

**Agent storage scans all JSON files on every list operation:**

- Current capacity: Works well for dozens to low hundreds of agents.
- Limit: With thousands of agents, the directory scan and JSON parse on `listAgents()` becomes noticeable.
- Files: `packages/server/src/server/agent/agent-storage.ts`
- Scaling path: Add an in-memory index keyed by agent ID that is rebuilt on startup and updated incrementally.

---

## Dependencies at Risk

**`node-pty@1.2.0-beta.11` (pre-release):**

- Risk: Using a beta release for the core PTY functionality. Beta APIs or native binaries may change without semver guarantees.
- Files: `packages/server/package.json:79`, `packages/server/src/terminal/terminal.ts:1`
- Impact: PTY spawning, resize handling, and terminal I/O could regress on Node.js version upgrades or platform changes.
- Migration plan: Track the stable `node-pty` release and upgrade when available. There is already a workaround comment for a missing execute bit in 1.1.0 (`terminal.ts:115`).

**`experimental_createMCPClient` from `ai@5.0.78`:**

- Risk: AI SDK 5 is a major version with breaking changes; the MCP client is explicitly experimental.
- Impact: Agent MCP tool calls (`session.ts`) could break on any `ai` package upgrade.
- Migration plan: Pin `ai` strictly (no `^`) or monitor the AI SDK changelog before upgrading.

---

## Missing Critical Features

**Image viewing in artifact drawer:**

- Problem: Image artifacts received from agents display "Image viewing not yet implemented".
- Files: `packages/app/src/components/artifact-drawer.tsx:223`
- Blocks: Full artifact review workflow for image-generating agents.

**OpenCode persisted agent listing:**

- Problem: Persisted OpenCode sessions are never surfaced after daemon restart (returns empty array).
- Files: `packages/server/src/server/agent/providers/opencode-agent.ts:506-509`
- Blocks: Session continuity for OpenCode provider.

---

## Test Coverage Gaps

**`session.ts` — no unit tests:**

- What's not tested: All WebSocket message dispatch, file explorer integration, voice session creation, MCP client setup, git operations, timeline cursor pagination, permission handling.
- Files: `packages/server/src/server/session.ts` (6,778 lines)
- Risk: Regressions in any of these paths are caught only by E2E tests or in production.
- Priority: High

**`relay-transport.ts` — only E2E tests:**

- What's not tested: Reconnection logic, keepalive timer behavior, data socket lifecycle, control message parsing edge cases.
- Files: `packages/server/src/server/relay-transport.ts`
- Risk: Relay reconnection bugs are hard to reproduce in E2E; unit tests for the state machine would catch most regressions.
- Priority: Medium

**`websocket-server.ts` — only smoke tested:**

- What's not tested: Origin/host rejection logic, binary mux framing, multi-session routing, external socket metadata handling.
- Files: `packages/server/src/server/websocket-server.ts`
- Risk: Origin bypass bugs or session routing errors would only appear under specific client configurations.
- Priority: Medium

**`bootstrap.ts` — no coverage for `/api/files/download` endpoint:**

- What's not tested: Download token consumption, MIME type headers, streaming error handling, missing/expired token 403.
- Files: `packages/server/src/server/bootstrap.ts:214-261`
- Risk: Download regressions are silent; file downloads are user-visible.
- Priority: Medium

**Terminal E2E suite skipped on CI:**

- What's not tested: PTY attach/detach, binary mux framing, terminal resize, stream reconnection, alternate-screen transitions.
- Files: `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` (skipped when `CI=true`)
- Risk: Any PTY or terminal protocol regression ships undetected.
- Priority: High — either fix the CI environment to support PTY or extract the core logic into unit-testable helpers.

**No coverage threshold enforced:**

- What's not tested: No `coverage` key exists in either `packages/server/vitest.config.ts` or `packages/app/vitest.config.ts`. Coverage is never collected or gated.
- Files: `packages/server/vitest.config.ts`, `packages/app/vitest.config.ts`
- Risk: Coverage can silently decrease across any PR.
- Priority: Low — set a reasonable initial threshold (e.g., 40%) and enforce in CI.

---

_Concerns audit: 2026-02-21_
