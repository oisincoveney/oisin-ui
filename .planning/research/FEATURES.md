# Features Research: v3 TABS COOLERS

**Domain:** Multi-tab terminals, AI chat overlay, voice input, git push for AI coding agent web UI  
**Researched:** 2026-03-02  
**Overall Confidence:** HIGH (direct analysis of Warp, iTerm2, Cursor, Whisper, GitButler, isomorphic-git)

---

## Executive Summary

v3 TABS COOLERS extends existing Oisin UI (which already has single terminal per thread) with:
1. **Multi-tab terminals** per thread — split panes and multiple terminal sessions
2. **AI chat overlay** — chat-style wrapper around terminal for natural conversation
3. **Voice input** — speak prompts to the agent
4. **Git push** — push commits to remote from browser UI

These features align with modern AI coding tools (Warp, Cursor) but maintain Oisin UI's agent-agnostic terminal-first philosophy.

---

## Multi-Tab Terminals

### Table Stakes

What users expect from multi-tab terminal UIs, based on iTerm2, Warp, VS Code terminal:

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Add/close tab buttons** | Universal pattern (iTerm2, every browser) | Low | Tab state management | Plus button, X on tabs |
| **Tab naming/renaming** | iTerm2, Warp: users name tabs by task | Low | State persistence | Double-click to rename or context menu |
| **Tab reordering** | Drag-and-drop tabs is standard | Med | Drag-drop library | react-dnd or native drag |
| **Tab status indicators** | Show if process running, exit code | Low | PTY event handling | Dot/icon for running, color for exit |
| **Keyboard shortcuts** | Cmd+T new tab, Cmd+W close, Cmd+1-9 switch | Low | Keybinding system | Must match platform conventions |
| **Preserve terminal state on tab switch** | Switching tabs shouldn't reset terminal buffer | Low | xterm.js per tab | Already natural with xterm.js instances |
| **Visual active tab indicator** | Highlight which tab is focused | Low | CSS | Border/background highlight |
| **Tab overflow handling** | Scrollable tabs when >8-10 tabs | Med | CSS/scroll container | Arrows or scroll |

**Critical requirement:** Each tab = separate tmux window or pane within thread's session. Tabs share the worktree context but run independent processes.

### Differentiators

What would make Oisin UI's tabs special vs. competitors:

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"Agent" vs "Shell" tab types** | Distinguish agent output (read-only stream) from interactive shell | Med | Different terminal modes |
| **Split panes within tabs** | iTerm2-style horizontal/vertical splits | Med-High | Resizable panes, nested layout |
| **Persistent tab layouts** | Remember tab arrangement per thread | Med | State serialization |
| **Tab-to-terminal type mapping** | New tab lets you pick: Shell, Claude Code, OpenCode, Aider | Med | Stored agent configs |
| **Tab linking** | Link tabs so input in one echoes to others (for testing) | High | Complex I/O routing |
| **Focus follows mouse** | iTerm2 feature — hover to focus pane | Low | Mouse event handling |

### Anti-Features (What NOT to Build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full tmux control UI** | tmux is complex (sessions, windows, panes). Replicating full control is massive scope | Provide tab/pane basics. Power users can attach to tmux directly |
| **Remote SSH tabs** | Would need SSH key management, jump hosts, etc. | Users can SSH within terminal. Stay focused on local agent workflow |
| **Terminal settings UI** | Font size, colors, themes — infinite complexity | Sensible defaults. Maybe one theme toggle. Users configure tmux/shell |
| **Terminal profiles** | Different shells, env vars per profile | Single shell. Users can source their own configs |

---

## AI Chat Overlay

### Table Stakes

Expected chat UI behavior when wrapping terminal, based on Cursor, Warp, Claude/ChatGPT interfaces:

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Message bubbles** | Universal chat pattern (iMessage, Slack, ChatGPT) | Low | Chat component | User on right, agent on left |
| **Markdown rendering** | Code blocks, bold, lists in agent responses | Med | Markdown parser | Use react-markdown or similar |
| **Code block styling** | Syntax highlighting in code fences | Med | Shiki/Prism | Match terminal theme |
| **Copy code button** | One-click copy from code blocks | Low | Clipboard API | Standard pattern |
| **Scrollable history** | Scroll up to see conversation history | Low | Scroll container | With auto-scroll to bottom on new |
| **Input field at bottom** | Standard chat composer position | Low | Textarea/input | Multi-line support |
| **Send button + Enter-to-send** | Submit via button or keyboard | Low | Form handling | Shift+Enter for newline |
| **Thinking/loading indicator** | Show when agent is processing | Low | Spinner/animation | "Agent is thinking..." |
| **Timestamp on messages** | When was this message sent | Low | Date formatting | Relative ("2m ago") or absolute |

**Key insight:** The chat overlay wraps terminal I/O. User message = stdin to agent. Agent response = parsed stdout. The terminal runs in background; chat is a friendlier view.

### Differentiators

What would make this special vs. raw terminal or basic chat wrappers:

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Terminal/Chat toggle** | Switch between raw terminal view and chat overlay instantly | Med | Shared terminal state, different renderers |
| **Streaming responses** | Show agent output character-by-character as it types | Med | Parse terminal stream into chat messages |
| **Tool call visualization** | Show "Agent is editing files" with collapsible details | Med-High | Parse agent tool-use patterns |
| **File diff inline** | Show code changes in chat message, not just text | Med | Diff rendering in chat |
| **"Apply" buttons** | One-click apply suggested code change | Med-High | Git operations from UI |
| **Re-run/retry message** | Retry a failed agent action | Med | Message history manipulation |
| **Edit previous message** | Edit and re-send user message | Med | Message mutation |
| **Context indicators** | Show what files/context agent has | Med | Parse agent context logs |
| **@ mentions** | @file to add file to context, @web for search | Med-High | Context system |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **LLM API integration in chat** | Already ruled out. Chat wraps terminal agent, doesn't call API directly | Terminal agent handles model selection |
| **Image generation in chat** | Out of scope. This is coding agent UI | If agent outputs images, display them. Don't generate |
| **Chat history persistence across threads** | Each thread is isolated. Chat is thread-scoped | Archive threads with history |
| **Multi-agent orchestration in chat** | Complex, out of scope for v3 | Single agent per terminal. Multiple tabs for multiple agents |
| **Real-time collaboration** | Multiple users in same chat | Single-user tool. Out of scope |

---

## Voice Input

### Table Stakes

Expected voice input behavior, based on Whisper, Warp (Wispr Flow), mobile voice assistants:

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Push-to-talk button** | Hold/click to record voice | Low | Button component | Microphone icon |
| **Recording indicator** | Show when actively recording (pulsing dot, waveform) | Low | CSS animation | Red dot is universal |
| **Transcription display** | Show text as it's transcribed | Med | Streaming transcription | Live preview |
| **Send on release** | Stop recording = send message | Low | Event handling | Natural PTT behavior |
| **Permission request** | Browser mic permission handling | Low | Permissions API | Standard browser flow |
| **Error states** | Mic denied, no speech detected, network error | Low | Error messages | Clear feedback |
| **Microphone level indicator** | Show audio is being captured | Low | AudioContext visualization | VU meter or waveform |

**Critical decision:** Local vs API transcription
- **OpenAI Whisper API:** Best quality (gpt-4o-transcribe), requires API key, costs money, adds latency
- **Browser SpeechRecognition API:** Free, works offline, variable quality, not all browsers
- **Local Whisper (whisper.cpp/Sherpa):** Good quality, runs locally, but adds deployment complexity

**Recommendation:** Start with OpenAI Whisper API (user provides API key). Add local Sherpa option later. Browser API as fallback.

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Voice activity detection (VAD)** | Auto-detect speech start/end, no button needed | Med | Silero VAD or similar |
| **Streaming transcription** | Words appear as you speak | Med | Whisper streaming API or local |
| **Multiple language support** | Transcribe non-English prompts | Low (Whisper supports) | 90+ languages |
| **Noise reduction** | Handle background noise | Low-Med | Whisper near_field/far_field |
| **Wake word** | "Hey Oisin" to start recording | High | Local wake word detection |
| **Voice commands** | "Run tests", "Commit this" → action | Med | Intent parsing |
| **TTS response** | Agent speaks back | Med-High | TTS API + audio playback |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-time voice conversation** | Requires complex duplex audio, adds massive complexity | One-way voice input, text response |
| **Voice agent control** | "Go back", "Undo that" for navigation | Standard UI controls. Voice is for input only |
| **Custom wake word training** | Users training their own wake words | Fixed wake word or PTT |
| **Voice authentication** | Speaker ID/verification | Out of scope. Single-user tool |
| **Continuous dictation mode** | Always listening and transcribing | PTT or VAD-gated. Privacy concern |

---

## Git Push

### Table Stakes

Expected push behavior, based on VS Code, GitButler, GitHub Desktop:

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Push button** | One-click push to current branch's upstream | Low | Git CLI wrapper | After commit, push option |
| **Remote branch status** | Show if local is ahead/behind remote | Med | `git status -sb` parsing | "3 commits ahead" |
| **Push progress indicator** | Show push is in progress | Low | Spinner/loading | Git push can take seconds |
| **Success/failure feedback** | Clear message on push result | Low | Toast/notification | "Pushed to origin/main" |
| **Authentication handling** | SSH key or HTTPS token auth | Med | Credential passthrough | Usually handled by git config |
| **Pull before push warning** | Warn if remote has new commits | Med | Remote fetch | "Push rejected: pull first" |

**Implementation note:** Git push happens server-side (in Docker container). Browser UI triggers it via API. SSH keys must be available in container.

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Push from worktree to remote** | Push worktree branch, not just main | Low | Worktree-aware push |
| **Force push option** | For rebased branches (with warning) | Low | `--force-with-lease` |
| **Remote selection** | Push to origin, upstream, or custom remote | Med | Remote picker |
| **Create PR after push** | Push then auto-open GitHub PR creation | Med | gh CLI integration |
| **Branch creation on push** | Push new local branch to remote | Low | `git push -u origin <branch>` |
| **Push multiple branches** | Batch push for stacked branches | Med | Multi-branch selection |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **PR creation UI** | Full PR form (title, description, reviewers, labels) | `gh pr create` in terminal. Or just link to GitHub |
| **PR review in UI** | View/approve/merge PRs | Out of scope. Use GitHub/GitLab |
| **GitHub/GitLab API integration** | OAuth, token management, rate limits | User configures git credentials. We shell out to git/gh |
| **Merge conflict resolution** | Complex diff UI for conflicts | Terminal-based resolution. `git mergetool` |
| **Branch protection bypass** | Override branch rules | Not possible anyway. Respect protections |

---

## Reference Implementations

### Warp (terminal + AI)
**Source:** warp.dev (HIGH confidence)

**What they do well:**
- Universal Input: Rich prompt editor with @-mentions, image uploads, voice via Wispr Flow
- Oz agent: Built-in SOTA coding agent with planning/review
- Multi-model support: OpenAI, Anthropic, Google models
- Blocks: Terminal output grouped by command for easier reading
- Modern terminal UX: Split panes, command history, autocomplete
- Code review interface: Line-by-line comments on diffs

**Relevant patterns:**
- Voice via Wispr Flow integration (external service)
- Rich context input (files, images, URLs)
- Built-in diff review for agent changes
- Agent profiles with permission controls

### iTerm2 (terminal)
**Source:** iterm2.com/features.html (HIGH confidence)

**What they do well:**
- Split panes: Vertical/horizontal splits in any arrangement
- Hotkey window: Global shortcut for instant terminal access
- Search: Find-on-page across terminal output with regex
- Autocomplete: Cmd+; for word completion from history
- Instant Replay: Scroll back in time through terminal history
- Copy mode: Keyboard-driven text selection
- Shell Integration: Track prompts, commands, directories
- Badges: Show current git branch, hostname in corner
- Triggers: Run actions on regex matches in output

**Relevant patterns:**
- Split pane architecture with drag resize
- Tab bar with status indicators
- Shell integration protocol for enhanced features

### Cursor (IDE + AI)
**Source:** cursor.com (HIGH confidence)

**What they do well:**
- Composer: Agentic coding with planning view
- Multi-model selection: Pick best model per task
- Tab autocomplete: Specialized fast model
- Slack/GitHub integration: @cursor mentions
- Code review: BugBot for PR review
- Codebase indexing: Semantic search

**Relevant patterns:**
- Chat panel in IDE layout
- Streaming agent responses
- Tool call visualization
- Multi-agent (subagent spawning)

### GitButler (git UI)
**Source:** github.com/gitbutlerapp/gitbutler (HIGH confidence)

**What they do well:**
- Parallel branches: Multiple branches checked out simultaneously
- Stacked branches: Easy rebasing and restacking
- Drag-and-drop staging: Visual hunk staging
- Undo timeline: Revert any operation
- First-class conflicts: Conflicts don't block workflow
- AI commit messages: Auto-generate descriptions

**Relevant patterns:**
- Multi-branch parallel work (similar to worktrees)
- Visual staging with drag-and-drop
- Operation undo/redo system
- Conflict handling as first-class feature

### Whisper/OpenAI Speech API
**Source:** platform.openai.com/docs/guides/speech-to-text (HIGH confidence)

**Key capabilities:**
- Models: whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, gpt-4o-transcribe-diarize
- Streaming: Stream transcription deltas in real-time
- Languages: 90+ languages supported
- Prompting: Guide transcription with context
- Timestamps: Word/segment level timestamps
- Diarization: Speaker identification (gpt-4o-transcribe-diarize)

**Implementation approach:**
```javascript
// Streaming transcription
const stream = await openai.audio.transcriptions.create({
  file: audioFile,
  model: "gpt-4o-mini-transcribe",
  response_format: "text",
  stream: true,
});
for await (const event of stream) {
  // Show partial transcription
}
```

### isomorphic-git (browser git)
**Source:** isomorphic-git.org (HIGH confidence)

**What it provides:**
- Pure JavaScript git implementation
- Works in browser (clone, commit, push)
- Same .git format as regular git
- HTTP/HTTPS remote support

**Consideration:** Could enable browser-side git operations. BUT: Oisin UI runs terminals server-side where real git is available. isomorphic-git adds complexity without clear benefit. **Recommendation:** Use server-side git CLI, not browser-side isomorphic-git.

---

## Feature Dependencies (v3 Context)

```
EXISTING (v2)
├── Single terminal per thread (xterm.js + tmux)
├── Multi-project sidebar
├── Thread management
├── Code diff view with staging
├── Git commit from UI
└── WebSocket relay

v3 ADDITIONS
├── Multi-Tab Terminals
│    ├── Tab state management
│    ├── Multiple xterm.js instances per thread
│    ├── tmux window/pane coordination
│    └── Tab keyboard shortcuts
│
├── AI Chat Overlay
│    ├── Terminal output parsing → chat messages
│    ├── Markdown/code rendering
│    ├── Terminal ↔ Chat view toggle
│    └── Streaming message display
│
├── Voice Input
│    ├── Audio capture (MediaRecorder API)
│    ├── Whisper API integration
│    ├── PTT button UI
│    └── Transcription display
│
└── Git Push
     ├── Push button in diff panel
     ├── Remote status display
     └── Push result notification
```

**Dependency order:**
1. Multi-tab terminals (foundation for multiple agent types)
2. Git push (builds on existing diff/commit)
3. Chat overlay (requires stable terminal parsing)
4. Voice input (independent, can be added anytime)

---

## MVP Definition for v3

### Phase 1: Multi-Tab Terminals
- Add/close tabs
- Tab switching with keyboard shortcuts (Cmd+1-9, Cmd+T, Cmd+W)
- Tab renaming
- Tab status indicators (running/stopped)
- Preserve terminal state across tab switches

### Phase 2: Git Push
- Push button after commit
- Ahead/behind remote indicator
- Push progress and result feedback
- Force push with warning

### Phase 3: AI Chat Overlay
- Chat view toggle (terminal ↔ chat)
- Message bubbles with markdown
- Code block rendering
- Streaming display
- Basic tool call indication

### Phase 4: Voice Input
- PTT button with recording indicator
- Whisper API transcription
- Send on release
- Error handling for permissions/failures

---

## Sources

| Source | URL | Confidence | Date Verified |
|--------|-----|------------|---------------|
| Warp Homepage | warp.dev | HIGH | 2026-03-02 |
| iTerm2 Features | iterm2.com/features.html | HIGH | 2026-03-02 |
| Cursor Homepage | cursor.com | HIGH | 2026-03-02 |
| GitButler GitHub | github.com/gitbutlerapp/gitbutler | HIGH | 2026-03-02 |
| OpenAI Whisper Docs | platform.openai.com/docs/guides/speech-to-text | HIGH | 2026-03-02 |
| OpenAI Whisper Intro | openai.com/index/whisper | HIGH | 2026-03-02 |
| isomorphic-git | isomorphic-git.org | HIGH | 2026-03-02 |
| v2 FEATURES.md | Local file (preserved below) | HIGH | 2026-02-21 |

---

## Appendix: Original v2 Feature Research (Preserved)

The original feature research from v2 remains relevant for context. Key points:

**Table Stakes (already built or in progress):**
- Multi-project sidebar ✅
- Thread management ✅
- Embedded terminal per thread ✅
- Code diff view ✅
- Git commit UI ✅
- WebSocket reliability ✅

**v3 addresses these from v2 "Phase 3" backlog:**
- Multiple terminal tabs (now v3 Phase 1)
- Push/branch management (now v3 Phase 2)

**Still deferred:**
- Voice input was listed as anti-feature in v2. Now promoted to v3 Phase 4 based on user demand.
- PR creation remains anti-feature. Use `gh pr create` in terminal.
