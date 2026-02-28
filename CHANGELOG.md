# Changelog

## v1.1 Hardening - 2026-02-28

### Added
- Added bounded attach recovery state machine (60s deadline) with visible retry UX showing attempt count, remaining window, and last error.
- Added bounded queued terminal input with flush-on-attach and oldest-first FIFO eviction semantics.
- Added `waitForPostConnectReady` barrier to eliminate first-request WebSocket race on session startup.
- Added `getActiveThread()` registry to daemon thread manager.
- Added deterministic diff-panel browser regression with isolated server/e2e fixture (no conditional skip path).
- Added create->switch->delete deterministic thread management browser regression.
- Added daemon e2e first-RPC reliability assertion with bounded latency across repeated fresh connections.

### Improved
- Hardened create-thread failure contract: typed dialog with `summary`, `details`, `copyText`, `requestId` instead of flat error strings.
- Active-delete now immediately transitions to `No active thread` null state with stale attach retry cancellation.
- Restart detection now keys off `serverId` identity change rather than WebSocket transport state alone.
- Warm-up lock gates create/switch/delete until thread refresh and attach settle after restart recovery.
- Restart recovery restores prior active thread if present, else falls back to newest thread by `updatedAt`.
- Reconnect success toast is token-deduped so `Reconnected` emits exactly once per recovery cycle.
- Claude provider availability probing is async and cached (no constructor-time sync shell checks on startup path).
- Ensure-default response now emits real `projectId` and `resolvedThreadId` from server registry.
- `threadScope` relaxed to `z.string()` for backward compatibility; `projectId`/`resolvedThreadId` required-nullable in ensure-default schema.

### Fixed
- Fixed server-side first-request WebSocket race where inbound messages arrived before session dispatch was ready.
- Fixed ensure-default metadata placeholders: web store now consumes real server-emitted project/thread context.
- Fixed terminal-manager env tests: time-bounded retry loop handles shell startup latency under parallel test load.
- Fixed diff-panel spec conditional skip path by migrating to deterministic worktree fixture with `git mv` for staged rename detection.
- Fixed attach recovery retry state leaking across active-thread-null transitions; cancels stale pending attach/ensure retries on null.

## 0.1.15 - 2026-02-19
### Added
- Added a public changelog page on the website so users can browse release notes.

### Improved
- Redesigned the website get-started experience into a clearer two-step flow.
- Simplified website GitHub navigation and changelog headings.
- Improved app draft/new-agent UX with clearer working directory placeholder and empty-state messaging.
- Enabled drag interactions in previously unhandled areas on the desktop (Tauri) draft screen.
- Hid empty filter groups in the left sidebar.

### Fixed
- Fixed archived-agent navigation by redirecting archived agent routes to draft.
- Fixed duplicate `/rewind` user-message behavior.

## 0.1.14 - 2026-02-19
### Added
- Added Claude `/rewind` command support.
- Added slash command access in the draft agent composer.
- Added `@` workspace file autocomplete in chat prompts.
- Added support for pasting images directly into prompt attachments.
- Added optimistic image previews for pending user message attachments.
- Added shared desktop/web overlay scroll handles, including file preview panes.

### Improved
- Improved worktree flow after shipping, including better merged PR detection.
- Improved draft workflow by enabling the explorer sidebar immediately after CWD selection.
- Improved new worktree-agent defaults by prefilling CWD to the main repository.
- Improved desktop command autocomplete behavior to match combobox interactions.
- Improved git sync UX by simplifying sync labels and only showing Sync when a branch diverges from origin.
- Improved desktop settings and permissions UX in Tauri.
- Improved scrollbar visibility, drag interactions, tracking, and animation timing on web/desktop.

### Fixed
- Fixed worktree archive/setup lifecycle issues, including terminal cleanup and archive timing.
- Fixed worktree path collisions by hashing CWD for collision-safe worktree roots.
- Fixed terminal sizing when switching back to an agent session.
- Fixed accidental terminal closure risk by adding confirmation for running shell commands.
- Fixed archive loading-state consistency across the sidebar and agent screen.
- Fixed autocomplete popover stability and workspace suggestion ranking.
- Fixed dictation timeouts caused by dangling non-final segments.
- Fixed server lock ownership when spawned as a child process by using parent PID ownership.
- Fixed hidden directory leakage in server CWD suggestions.
- Fixed agent attention notification payload consistency across providers.
- Fixed daemon version badge visibility in settings when daemon version data is unavailable.

## 0.1.9 - 2026-02-17
### Improved
- Unified structured-output generation through a single shared schema-validation and retry pipeline.
- Reused provider availability checks for structured generation fallback selection.
- Added structured generation waterfall ordering for internal metadata and git text generation: Claude Haiku, then Codex, then OpenCode.

### Fixed
- Fixed CLI `run --output-schema` to use the shared structured-output path instead of ad-hoc JSON parsing.
- Fixed `run --output-schema` failures where providers returned empty `lastMessage` by recovering from timeline assistant output.
- Fixed internal commit message, pull request text, and agent metadata generation to follow one consistent structured pipeline.

## 0.1.8 - 2026-02-17
### Added
- Added a cross-platform confirm dialog flow for daemon restarts.

### Improved
- Simplified local speech bootstrap and daemon startup locking behavior.
- Updated website hero copy to emphasize local execution.

### Fixed
- Fixed stuck "send while running" recovery across app and server session handling.
- Fixed Claude session identity preservation when reloading existing agents.
- Fixed combobox option behavior and related interactions.
- Fixed Tauri file-drop listener cleanup to avoid uncaught unlisten errors.
- Fixed web tool-detail wheel event routing at scroll edges.

## 0.1.7 - 2026-02-16
### Added
- Improved agent workspace flows with better directory suggestions.
- Added iOS TestFlight and Android app access request forms on the website.

### Improved
- Unified daemon startup behavior between dev and CLI paths for more predictable local runs.
- Improved website app download and update guidance.

### Fixed
- Prevented an initial desktop combobox `0,0` position flash.
- Fixed CLI version output issues.
- Hardened server runtime loading for local speech dependencies.

## 0.1.6 - 2026-02-16
### Notes
- No major visible product changes in this patch release.

## 0.1.5 - 2026-02-16
### Added
- Added terminal reattach support and better worktree terminal handling.
- Added global keyboard shortcut help in the app.
- Added sidebar host filtering and improved agent workflow controls.

### Improved
- Improved worktree setup visibility by streaming setup progress.
- Improved terminal streaming reliability and lifecycle handling.
- Preserved explorer tab state so context survives navigation better.

## 0.1.4 - 2026-02-14
### Added
- Added voice capability status reporting in the client.
- Added background local speech model downloads with runtime gating.
- Added adaptive dictation finish timing based on server-provided budgets.
- Added relay reconnect behavior with grace periods and branch suggestions.

### Improved
- Improved connection selection and agent hydration reliability.
- Improved timeline loading with cursor-based fetch behavior.
- Improved first-run experience by bootstrapping a default localhost connection.
- Improved inline code rendering by auto-linkifying URLs.

### Fixed
- Fixed Linux checkout diff watch behavior to avoid recursive watches.
- Fixed stale relay client timer behavior.
- Fixed unnecessary git diff header auto-scroll on collapse.

## 0.1.3 - 2026-02-12
### Added
- Added CLI onboarding command.
- Added CLI `--output-schema` support for structured agent output.
- Added CLI agent metadata update support for names and labels.
- Added provider availability detection with normalization of legacy default model IDs.

### Improved
- Improved file explorer refresh feedback and unresolved checkout fallback handling.
- Added better voice interrupt handling with a speech-start grace period.
- Improved CLI defaults to list all non-archived agents by default.
- Improved website UX with clearer install CTA and privacy policy access.

### Fixed
- Fixed dev runner entry issues and sherpa TTS initialization behavior.

## 0.1.2 - 2026-02-11
### Notes
- No major visible product changes in this patch release.

## 0.1.1 - 2026-02-11

### Added
- Initial `0.1.x` release line.
