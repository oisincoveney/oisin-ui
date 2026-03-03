# Pitfalls Research: v3 TABS COOLERS

**Domain:** Adding multi-tab terminals, AI chat overlay, voice input, git push to existing Oisin UI
**Researched:** 2026-03-02
**Confidence:** HIGH (xterm.js memory), MEDIUM (Whisper container, OpenCode parsing), LOW (voice UX)

## Executive Summary

The highest-risk pitfalls for v3 are: (1) xterm.js memory leaks when creating/destroying multiple Terminal instances per thread, (2) parsing OpenCode output for chat overlay without breaking on edge cases, and (3) git push authentication in containerized environment. The existing architecture handles single-terminal-per-thread well but multi-tab multiplies resource management complexity.

---

## Multi-Tab Terminal Pitfalls

### P1: xterm.js Instance Memory Leak on Tab Close

**What goes wrong:** Each closed terminal tab leaks memory because event listeners, DOM observers, and WebGL contexts aren't properly cleaned up. After opening/closing 20+ tabs, the browser becomes sluggish. Confirmed xterm.js issues: #4935 (CoreBrowserService leak), #4645 (API facades leak), #3889 (WebGL GPU memory leak).

**Why it happens:** xterm.js Terminal instances register event listeners on `window` (resize, focus, blur) and the document. If you don't call `terminal.dispose()` properly, or if you dispose but keep references to the terminal object, garbage collection can't reclaim the memory. The WebGL addon has additional GPU texture buffers that need explicit cleanup.

Specific leak sources from xterm.js issues:
- `CoreBrowserService`: `ScreenDprMonitor` not registered as disposable (fixed in 6.0.0)
- API facades (`BufferNamespaceApi`): EventEmitter instances not disposed
- WebGL addon: GPU textures not deleted on addon dispose

**Warning signs:**
- Chrome DevTools Memory tab shows increasing heap size after closing tabs
- `performance.measureMemory()` shows growth over time
- Browser tab becomes sluggish after many tab open/close cycles
- WebGL context lost errors in console

**Prevention:**
1. **Always call `terminal.dispose()`** when closing a tab. Not just removing from DOM.
2. **Dispose addons first**: `fitAddon.dispose()`, `webglAddon?.dispose()` before `terminal.dispose()`
3. **Clear references**: Set terminal variable to null after dispose
4. **Use canvas renderer initially**: Skip WebGL addon until performance proves it's needed. Canvas renderer has simpler cleanup.
5. **Test with memory profiler**: Before shipping multi-tab, run a loop of 50 tab open/close cycles and verify heap doesn't grow
6. **Upgrade to xterm.js 6.x+**: The CoreBrowserService leak was fixed in 6.0.0

**Code pattern:**
```typescript
function closeTab(tabId: string) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  
  // Dispose addons first
  tab.fitAddon?.dispose();
  tab.webglAddon?.dispose();
  
  // Dispose terminal
  tab.terminal.dispose();
  
  // Clear references
  tabs.delete(tabId);
  
  // Notify backend to detach from stream (but keep tmux session)
  ws.send({ type: 'tab-close', tabId });
}
```

**Phase to address:** Multi-Tab Phase (implementation). Must be correct from first multi-tab commit.

---

### P2: Tmux Session Proliferation (N Sessions per Thread)

**What goes wrong:** Each tab in a thread creates its own tmux session. With 5 threads × 3 tabs = 15 tmux sessions. Resource usage spirals. The daemon can't track which sessions belong to which tabs. Orphaned sessions accumulate.

**Why it happens:** The current architecture (`terminal-manager.ts`) derives session names from `projectId + threadId`. If we naively create one session per tab, we need a new naming scheme that includes tab ID. But the existing lifecycle management only tracks by thread, not by tab.

**Warning signs:**
- `tmux ls` shows far more sessions than expected
- Memory usage climbs over days
- Daemon restart causes orphaned sessions

**Prevention:**
1. **Use tmux windows within sessions, not separate sessions**: One tmux session per thread, multiple windows (tabs). `tmux new-window -t session:1 -n "Tab 2"`. This keeps session count manageable.
2. **If using separate sessions per tab**: Extend session naming to `oisin-${projectId}-${threadId}-tab${tabIndex}-${hash}`. Add `tabId` to the session metadata tracking.
3. **Session cleanup on tab close**: When closing a tab, kill only that tmux window/session. Don't kill the whole thread's sessions.
4. **Tab count limits**: Set a reasonable max tabs per thread (e.g., 5). Block creation beyond that.

**Current vs proposed architecture:**
```
Current: 1 thread = 1 tmux session
         oisin-myproject-thread123-abc12345

Proposed Option A (windows): 
         1 thread = 1 tmux session with N windows
         oisin-myproject-thread123-abc12345
           Window 0: Tab 1
           Window 1: Tab 2
           Window 2: Tab 3

Proposed Option B (sessions):
         1 thread = N tmux sessions
         oisin-myproject-thread123-tab0-abc12345
         oisin-myproject-thread123-tab1-def67890
```

**Recommendation:** Option A (windows) is cleaner for resource management and matches VSCode's terminal model.

**Phase to address:** Multi-Tab Phase. Architecture decision needed before implementation.

---

### P3: State Synchronization When Tab Switches

**What goes wrong:** User switches from Tab 1 to Tab 2. The WebSocket connection was streaming Tab 1's terminal output. Now it needs Tab 2's output. During the switch, there's a flash of stale content, or Tab 2 shows Tab 1's output briefly, or Tab 2 is blank.

**Why it happens:** 
- The existing `subscribeRaw` API (`tmux-terminal.ts`) supports a single output stream per connection
- Tab switch requires: stop Tab 1 stream, capture Tab 2's current state, start Tab 2 stream
- Race condition: output arrives from Tab 1 after switch, before Tab 2 stream starts

**Warning signs:**
- Brief flash of wrong terminal content
- Missing output immediately after switch
- Duplicate output after rapid tab switching

**Prevention:**
1. **Sequence IDs per tab**: Every message includes `{ tabId, sequenceId }`. Client ignores messages for non-active tab.
2. **Full state capture on switch**: Don't rely on incremental updates. On tab switch, request full `capture-pane` for the new tab.
3. **Clear terminal before showing new tab**: `terminal.clear()` then write captured state, then resume stream.
4. **Server-side multiplexing**: The daemon knows which tab is active and only sends that tab's output over WebSocket.

**Mux protocol extension:**
```typescript
// Current protocol (single terminal per thread):
{ type: 'terminal-output', threadId, data }

// Extended protocol (multi-tab):
{ type: 'terminal-output', threadId, tabId, data }
{ type: 'tab-switch-ack', threadId, tabId, capturedState }
```

**Phase to address:** Multi-Tab Phase. Protocol change needed.

---

### P4: Resize Handling with Multiple Tabs

**What goes wrong:** User resizes the terminal panel. Which tmux session(s) get resized? If only the active tab is resized, inactive tabs have wrong dimensions when switched to. If all tabs are resized, there's a burst of resize commands.

**Why it happens:** Each xterm.js terminal instance has its own dimensions. Each tmux window/session has its own dimensions. These need to stay in sync. But only the visible terminal knows its actual pixel dimensions.

**Warning signs:**
- Switching tabs shows garbled output
- Full-screen apps (vim) break after resize then tab switch
- Resize events queued up, applied out of order

**Prevention:**
1. **Resize all tabs in a thread**: When the panel resizes, send resize to all tmux windows in that thread's session.
2. **Store dimensions per thread, not per tab**: All tabs in a thread share the same dimensions.
3. **On tab switch, re-apply dimensions**: After capturing state, send resize command to ensure dimensions match.
4. **Debounce aggressively**: 300ms debounce before sending resize to any tmux session.

**Phase to address:** Multi-Tab Phase. Must be handled correctly or TUI apps break.

---

## AI Chat Overlay Pitfalls

### P5: OpenCode Output Parsing Edge Cases

**What goes wrong:** The chat overlay parses terminal output to extract OpenCode's messages (model responses, tool calls, errors). But OpenCode's output format isn't a stable API. A minor OpenCode update changes the format, breaking parsing. Or edge cases (long lines, ANSI codes, Unicode) cause parser to miss or mangle content.

**Why it happens:** OpenCode writes to a terminal, not a structured API. The output includes:
- ANSI escape codes for colors and cursor movement
- Line wrapping (depends on terminal width)
- Progress spinners and overwritten lines
- Tool call blocks with markdown-like formatting
- Error messages with stack traces

**Warning signs:**
- Chat view shows garbled text
- Messages split incorrectly
- Tool calls not recognized
- Chat works locally but breaks in different terminal size

**Prevention:**
1. **Strip ANSI first**: Use `strip-ansi` library before parsing content.
2. **Regex for known patterns, not full parsing**: Look for `###` headings, `>` quotes, code block markers. Don't try to parse the full output grammar.
3. **Graceful degradation**: If parsing fails, show raw output. Better than nothing.
4. **Version pin OpenCode**: If relying on specific output format, document which OpenCode version is tested.
5. **Capture full terminal width output**: Parse at the original line length, not the wrapped display.
6. **Test with real OpenCode output**: Record actual sessions, use as test fixtures.

**Parsing strategy:**
```typescript
// DON'T: Try to fully parse structured output
// DO: Look for specific markers

const OPENCODE_MARKERS = {
  THINKING_START: /^#{3,}\s*Thinking/i,
  RESPONSE_START: /^#{3,}\s*Response/i,
  TOOL_CALL: /^>\s*Tool:\s*(\w+)/,
  ERROR: /^Error:|^fatal:/i,
};

function extractChatBlocks(rawOutput: string): ChatBlock[] {
  const cleaned = stripAnsi(rawOutput);
  // ... marker-based extraction
}
```

**Phase to address:** Chat Overlay Phase. Need OpenCode output samples first.

---

### P6: Terminal Output vs Chat State Mismatch

**What goes wrong:** The chat view shows OpenCode's parsed messages. The terminal shows raw output. User sees something in terminal that doesn't appear in chat, or vice versa. Confusing experience.

**Why it happens:**
- Terminal has scrollback; chat may not capture everything
- Parsing errors cause missed messages
- User can type in terminal, which doesn't show in chat
- OpenCode can be in states (e.g., waiting for input) that don't map to chat

**Warning signs:**
- "I saw that message in the terminal but not in chat"
- Chat shows outdated state after terminal scroll
- Duplicate messages in chat

**Prevention:**
1. **Chat as a filtered view, not authoritative**: Make clear that chat is derived from terminal, not separate.
2. **Link chat messages to terminal positions**: Clicking a chat message scrolls terminal to that point.
3. **Don't persist chat separately**: Regenerate chat from terminal output on each view.
4. **Show terminal always, chat as optional overlay**: Never hide terminal entirely.

**Phase to address:** Chat Overlay Phase.

---

### P7: Performance Parsing Large Terminal Output

**What goes wrong:** OpenCode runs for an hour, generates 50MB of terminal output. Parsing this for chat view on every render is too slow. UI freezes.

**Why it happens:** Naive implementation parses entire output buffer on each update. With large output, this becomes O(n) on every keystroke.

**Warning signs:**
- UI lag increases over time
- Parser CPU spikes visible in profiler
- Chat overlay causes terminal to stutter

**Prevention:**
1. **Incremental parsing**: Track last-parsed offset. Only parse new output since then.
2. **Chunk boundaries**: Parse in chunks aligned to line boundaries.
3. **Virtualized chat list**: Only render visible chat messages. React-window or similar.
4. **Web Worker**: Move parsing to worker thread. Don't block main thread.
5. **Debounce updates**: Parse at most every 500ms, not on every byte.

**Phase to address:** Chat Overlay Phase. Performance-critical.

---

## Voice Input Pitfalls

### P8: Whisper Container Resource Usage

**What goes wrong:** Whisper model loads into memory (1-4GB depending on model size). Container memory spikes when processing audio. Multiple simultaneous transcription requests OOM the container.

**Why it happens:** Whisper is a large ML model. Even "tiny" model needs ~500MB. "base" needs ~1GB. "small" needs ~2GB. Audio processing is CPU-intensive or requires GPU. Container wasn't sized for this.

**Warning signs:**
- Container OOM killed during transcription
- Long delays before transcription starts (model loading)
- Transcription times out

**Prevention:**
1. **Use smallest viable model**: Start with "tiny" or "base". Accuracy is worse but resource usage manageable.
2. **Lazy load model**: Don't load Whisper on container start. Load on first voice request.
3. **Keep model in memory**: Once loaded, keep it. Reloading is slow.
4. **Memory limits**: Set container memory to at least 2GB for base model.
5. **Request queue**: Serialize transcription requests. Don't run multiple in parallel.
6. **Timeout**: Kill transcription if it takes >30s. Show error to user.

**Container config:**
```dockerfile
# Minimum for Whisper base model
# Memory: 2GB
# CPU: 2 cores

ENV WHISPER_MODEL=base
ENV WHISPER_DEVICE=cpu  # or cuda if GPU available
```

**Phase to address:** Voice Input Phase. Resource planning before implementation.

---

### P9: Browser Audio Capture Permissions and Quality

**What goes wrong:** User clicks "voice input" and nothing happens. Or transcription is garbage because of background noise, wrong microphone, or low sample rate.

**Why it happens:**
- Microphone permission denied or not prompted
- Wrong microphone selected (USB headset vs laptop mic)
- WebRTC audio processing (echo cancellation) mangling voice
- Low-quality audio codec for WebSocket streaming

**Warning signs:**
- Permission errors in console
- Transcription returns wrong text consistently
- Works on some browsers/devices but not others

**Prevention:**
1. **Explicit permission handling**: Show clear UI before requesting permission. Handle denial gracefully.
2. **Audio device selection**: Let user pick microphone. Store preference.
3. **Disable audio processing for transcription**: `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`. These help for calls but hurt transcription.
4. **Use high sample rate**: Request 16kHz minimum. Whisper expects 16kHz.
5. **Test on target browsers**: Safari has different audio APIs than Chrome.

**Audio capture pattern:**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }
});
```

**Phase to address:** Voice Input Phase.

---

### P10: Voice Activation UX Confusion

**What goes wrong:** User doesn't know when voice is recording, when it's processing, when to stop. Clicks button, waits, nothing visible happens. Or recording keeps going when they thought it stopped.

**Why it happens:**
- No visual feedback during recording
- Processing latency makes it feel broken
- Button state unclear

**Warning signs:**
- Users repeatedly clicking voice button
- Partial sentences transcribed (stopped too early)
- Very long recordings (didn't know how to stop)

**Prevention:**
1. **Clear visual state**: Distinct states for idle/recording/processing/error. Animation during recording.
2. **Audio waveform**: Show live waveform so user knows mic is working.
3. **Push-to-talk primary**: Hold button to record, release to transcribe. Simpler than toggle.
4. **Timeout**: Auto-stop after 60s max.
5. **Processing indicator**: Show "Transcribing..." with spinner after recording stops.
6. **Error messages**: "Couldn't access microphone", "Transcription failed - please try again"

**Phase to address:** Voice Input Phase.

---

## Git Push Pitfalls

### P11: SSH Authentication in Container

**What goes wrong:** User runs `git push` and gets "Permission denied (publickey)". SSH keys aren't available in the container, or ssh-agent isn't running, or known_hosts is empty.

**Why it happens:**
- SSH keys are on host, not mounted into container
- ssh-agent isn't forwarded
- Container doesn't have GitHub's host key in known_hosts
- User expects GitHub CLI auth to work but it requires different setup

**Warning signs:**
- "Permission denied (publickey)" on push
- "Host key verification failed"
- Push works from host but not from container

**Prevention:**
1. **Mount SSH keys**: `-v ~/.ssh:/root/.ssh:ro` in Docker run.
2. **Pre-populate known_hosts**: Add GitHub's host keys to container at build time.
3. **SSH agent forwarding**: Use `SSH_AUTH_SOCK` forwarding if host uses ssh-agent.
4. **HTTPS fallback**: Support HTTPS remotes with credential helper.
5. **Clear error messages**: Detect permission denied and explain "SSH keys not configured".

**Docker run additions:**
```bash
docker run \
  -v ~/.ssh:/root/.ssh:ro \
  -v $SSH_AUTH_SOCK:/ssh-agent \
  -e SSH_AUTH_SOCK=/ssh-agent \
  oisin-ui
```

**known_hosts prebuild:**
```dockerfile
RUN mkdir -p /root/.ssh && \
    ssh-keyscan github.com >> /root/.ssh/known_hosts
```

**Phase to address:** Git Push Phase. Config before implementation.

---

### P12: Force Push Danger

**What goes wrong:** User or agent runs `git push --force` and overwrites commits on shared branch. Other collaborators lose work. Even worse: force push to main/master.

**Why it happens:**
- AI agent doesn't understand the danger
- Merge conflicts lead to "just force push"
- No guardrails

**Warning signs:**
- "force" appearing in git commands
- Complaints from collaborators about missing commits

**Prevention:**
1. **Block `--force` on protected branches**: Parse git command, reject if force push to main/master/develop.
2. **Confirmation dialog for any force push**: "You are about to force push to 'feature-x'. This will overwrite remote history. Continue?"
3. **Prefer `--force-with-lease`**: If force push is needed, require `--force-with-lease` which fails if remote has new commits.
4. **Log all pushes**: Audit log of what was pushed, by whom/what.
5. **Agent instruction**: System prompt should forbid force push without explicit user confirmation.

**Force push guard:**
```typescript
function validateGitCommand(command: string): ValidationResult {
  const tokens = command.split(/\s+/);
  if (tokens[0] === 'git' && tokens[1] === 'push') {
    const hasForce = tokens.includes('--force') || tokens.includes('-f');
    const hasLease = tokens.includes('--force-with-lease');
    const branch = extractPushTarget(tokens);
    
    if (hasForce && !hasLease) {
      return { 
        allowed: false, 
        reason: 'Use --force-with-lease instead of --force',
        requiresConfirmation: true 
      };
    }
    if (isProtectedBranch(branch)) {
      return {
        allowed: false,
        reason: `Cannot push directly to protected branch: ${branch}`,
      };
    }
  }
  return { allowed: true };
}
```

**Phase to address:** Git Push Phase. Non-negotiable guardrail.

---

### P13: Remote Configuration Complexity

**What goes wrong:** User has multiple remotes (origin, upstream, fork). Push goes to wrong remote. Or remote doesn't exist. Or remote URL is wrong.

**Why it happens:**
- Worktree inherits repo remotes but user expectation differs
- Default push behavior varies by git config
- Fork workflows have origin=fork, upstream=original

**Warning signs:**
- "Push to wrong repo"
- "remote 'upstream' not found"
- Confused about which remote is which

**Prevention:**
1. **Show current remote in UI**: Before push, display "Pushing to: origin (git@github.com:user/repo.git)"
2. **Remote selector**: Let user pick remote if multiple exist.
3. **Default remote config**: Store user's preferred default per worktree.
4. **Validate remote exists**: Check `git remote -v` before push.
5. **Handle upstream tracking**: If branch has no upstream, prompt to set one.

**Phase to address:** Git Push Phase. UX design before implementation.

---

### P14: Push Fails Mid-Way

**What goes wrong:** Large push with many commits/LFS objects fails partway through. Unclear what succeeded and what didn't. User doesn't know if it's safe to retry.

**Why it happens:**
- Network interruption
- GitHub rate limiting
- LFS bandwidth limits
- Hook rejection

**Warning signs:**
- Timeout errors
- Partial push (some refs updated, others not)
- LFS errors

**Prevention:**
1. **Parse push output**: Detect partial success vs full failure.
2. **Clear status**: After push, show "Pushed: main, feature-x. Failed: hotfix-y (rejected by hook)"
3. **Retry guidance**: "Safe to retry" vs "Resolve conflict first"
4. **LFS awareness**: If repo uses LFS, warn about large files.

**Phase to address:** Git Push Phase.

---

## Integration Pitfalls (Existing Oisin Architecture)

### P15: WebSocket Protocol Extension Breaking Changes

**What goes wrong:** Adding multi-tab support requires new message types (`tab-create`, `tab-switch`, `tab-output`). Old clients don't understand new messages. New clients expect messages old daemon doesn't send.

**Why it happens:** The existing binary mux protocol (`terminal-stream.ts`) wasn't designed for multi-tab. Adding tab semantics requires protocol changes.

**Warning signs:**
- Old client + new daemon: missing tab UI
- New client + old daemon: errors on tab operations
- Mixed deployments during rollout

**Prevention:**
1. **Version field in handshake**: Client sends protocol version. Daemon negotiates.
2. **Graceful fallback**: New client on old daemon falls back to single-tab mode.
3. **Unknown message handling**: Both sides ignore unknown message types instead of erroring.
4. **Feature flags**: `capabilities: { multiTab: true, voiceInput: true }` in handshake.

**Protocol extension pattern:**
```typescript
// Handshake
{ type: 'hello', version: 2, capabilities: ['multi-tab', 'voice'] }
{ type: 'hello-ack', version: 2, capabilities: ['multi-tab'] }  // daemon doesn't support voice

// Feature check
if (capabilities.includes('multi-tab')) {
  enableMultiTab();
} else {
  // Single tab mode
}
```

**Phase to address:** Multi-Tab Phase. First thing to implement.

---

### P16: Terminal Manager Refactor for Multi-Tab

**What goes wrong:** Existing `terminal-manager.ts` assumes 1 terminal per thread (`ensureThreadTerminal`). Refactoring for N terminals per thread breaks existing tests and behavior.

**Why it happens:** The current API returns a single `TerminalSession`. Multi-tab needs `TerminalSession[]` or a different abstraction.

**Warning signs:**
- Tests failing after refactor
- Existing single-terminal functionality regresses
- Session naming conflicts

**Prevention:**
1. **Additive, not breaking**: Keep `ensureThreadTerminal` as "ensure default tab". Add `createThreadTab`, `getThreadTabs`.
2. **Internal: tmux windows**: Use tmux windows within session. Manager creates session once, then adds windows.
3. **Migrate incrementally**: First release keeps single-tab behavior. Multi-tab enabled by flag.

**API evolution:**
```typescript
// Existing (keep working)
ensureThreadTerminal(options): Promise<{ terminal, sessionKey, cwd }>

// New additions
createThreadTab(options): Promise<{ terminal, tabId, sessionKey }>
getThreadTabs(sessionKey): Promise<TerminalSession[]>
closeThreadTab(sessionKey, tabId): void
```

**Phase to address:** Multi-Tab Phase. Careful refactor.

---

### P17: Existing Reconnect Logic with Multi-Tab

**What goes wrong:** Current reconnect logic (`subscribeRaw` with `fromOffset`) replays a single terminal stream. With multiple tabs, client needs to recover all tabs' states. Reconnect takes much longer or misses some tabs.

**Why it happens:** Single-terminal reconnect captures one pane. Multi-tab needs to capture N panes and multiplex the replay.

**Warning signs:**
- Some tabs blank after reconnect
- Reconnect slower with more tabs
- Tab state inconsistent after reconnect

**Prevention:**
1. **Reconnect per active tab first**: On reconnect, only recover the currently-viewed tab initially.
2. **Lazy tab recovery**: Other tabs captured on-demand when switched to.
3. **Track all tabs server-side**: Daemon knows all tabs for a thread, can enumerate on reconnect.
4. **Client tab state**: Store tab IDs locally. On reconnect, request status of known tabs.

**Phase to address:** Multi-Tab Phase.

---

## Prevention Summary

| Pitfall | Prevention Strategy | Phase |
|---------|---------------------|-------|
| P1: xterm.js memory leak | Proper dispose chain, canvas renderer | Multi-Tab |
| P2: Tmux session proliferation | Tmux windows, not sessions | Multi-Tab |
| P3: Tab switch state sync | Sequence IDs, full capture on switch | Multi-Tab |
| P4: Multi-tab resize | Resize all tabs, debounce | Multi-Tab |
| P5: OpenCode parsing edge cases | Marker-based, graceful degradation | Chat Overlay |
| P6: Terminal/chat mismatch | Chat as filtered view, link to terminal | Chat Overlay |
| P7: Parsing performance | Incremental, Web Worker | Chat Overlay |
| P8: Whisper resources | Smallest model, lazy load, memory limits | Voice Input |
| P9: Audio capture issues | Explicit permissions, device selection | Voice Input |
| P10: Voice UX confusion | Clear states, push-to-talk | Voice Input |
| P11: SSH auth in container | Mount keys, known_hosts, agent forwarding | Git Push |
| P12: Force push danger | Block on protected, require --force-with-lease | Git Push |
| P13: Remote confusion | Show remote before push, selector | Git Push |
| P14: Push fails mid-way | Parse output, clear status | Git Push |
| P15: Protocol breaking changes | Version handshake, feature flags | Multi-Tab |
| P16: Terminal manager refactor | Additive API, tmux windows | Multi-Tab |
| P17: Reconnect with multi-tab | Active tab first, lazy recovery | Multi-Tab |

---

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| xterm.js #4935 (CoreBrowserService memory leak) | GitHub issue | HIGH |
| xterm.js #4645 (API facades leak memory) | GitHub issue | HIGH |
| xterm.js #3889 (WebGL addon GPU memory leak) | GitHub issue | HIGH |
| xterm.js docs (parser hooks, dispose pattern) | Official docs | HIGH |
| GitHub docs (SSH agent forwarding) | Official docs | HIGH |
| Existing Oisin codebase (terminal-manager.ts, tmux-terminal.ts) | Primary source | HIGH |
| Whisper model sizes and requirements | OpenAI docs | HIGH |
| WebRTC audio constraints | MDN | MEDIUM |
| OpenCode output format | Training knowledge | LOW |
