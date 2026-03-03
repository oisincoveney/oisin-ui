# Research Summary: v3 TABS COOLERS

**Synthesized:** 2026-03-02  
**Research Files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md  
**Overall Confidence:** HIGH

---

## Executive Summary

v3 TABS COOLERS adds four features to Oisin UI's existing terminal-first architecture: multi-tab terminals (N xterm.js instances per thread backed by tmux windows), AI chat overlay (rendering existing `AgentTimelineItem` stream as chat bubbles), voice input (leveraging existing `DictationStreamManager` with containerized Whisper), and git push (UI wiring only — backend already implemented via `checkout_push_request`).

The architecture analysis reveals surprisingly little greenfield work. Multi-tab is pure state orchestration over existing binary mux + tmux infrastructure. Chat overlay consumes the existing `agent_stream` messages. Voice input uses the existing dictation protocol. Git push needs only a button.

The critical risk is **xterm.js memory leaks** — each Terminal instance must be disposed correctly or memory spirals after 20+ tab open/close cycles. Secondary risks: OpenCode output parsing for chat (custom parser needs iteration), and SSH auth for git push in containers.

---

## Key Findings

### Stack Additions

| Library | Purpose | Package | Confidence |
|---------|---------|---------|------------|
| `ansi_up` v6.0.6 | ANSI→HTML for chat code blocks | web | HIGH |
| `whisper-asr-webservice` Docker | Local STT (optional) | docker-compose | HIGH |
| `simple-git` v3.x | Git push (if not already present) | server | HIGH |

**Already Present:** @xterm/xterm 6.0.0, @xterm/headless, binary-mux, tmux session management, DictationStreamManager, SpeechToTextProvider, AgentTimelineItem streaming.

**No new libraries needed for multi-tab.** Tab state is frontend-only over existing multiplexing.

### Feature Landscape

| Category | Table Stakes | Differentiators | Anti-Features |
|----------|-------------|-----------------|---------------|
| **Multi-Tab** | Add/close/rename tabs, keyboard shortcuts (Cmd+T/W/1-9), status indicators | Split panes, tab type selection (Shell vs Agent) | Full tmux control UI, remote SSH tabs |
| **Chat Overlay** | Message bubbles, markdown, code blocks, streaming, scroll history | Terminal/chat toggle, tool call visualization, file diff inline | LLM API in chat, multi-agent orchestration |
| **Voice Input** | PTT button, recording indicator, transcription display, permission handling | VAD auto-detect, streaming transcription, wake word | Real-time conversation, voice navigation |
| **Git Push** | Push button, ahead/behind indicator, progress, auth handling | Force-with-lease option, PR creation link | Full PR UI, merge conflicts in UI |

### Architecture Approach

**Multi-Tab:** Extend binary mux `streamId` to N streams per thread. Each tab = 1 xterm.js Terminal + 1 tmux window (not session). Tab state in new Zustand `TabStore`. Frame routing by streamId to correct adapter.

**Chat Overlay:** Subscribe to existing `agent_stream` messages. Map `AgentTimelineItem` → `ChatMessage`. New `ChatStore` (Zustand). `ChatOverlay` component with bubbles. Two input paths: terminal stdin (existing) + chat composer via `send_agent_message_request` (existing).

**Voice Input:** Use existing `DictationStreamManager` + `SpeechToTextProvider`. MediaRecorder chunks → WebSocket → server → Whisper → `dictation_stream_final`. Optional: add `LocalWhisperSTTProvider` for containerized Whisper.

**Git Push:** Call existing `checkout_push_request` from new button in DiffPanel. Handler already implemented in session.ts lines 4609-4635.

### Critical Pitfalls

| # | Pitfall | Severity | Prevention |
|---|---------|----------|------------|
| P1 | xterm.js memory leak on tab close | **CRITICAL** | Dispose addons before terminal, clear refs, use xterm 6.x, test with 50-cycle loop |
| P2 | Tmux session proliferation | HIGH | Use tmux windows within sessions, not N sessions per thread |
| P5 | OpenCode parsing edge cases | HIGH | Strip ANSI first, marker-based parsing, graceful degradation to raw output |
| P11 | SSH auth in container | HIGH | Mount ~/.ssh, prepopulate known_hosts, SSH agent forwarding |
| P12 | Force push danger | HIGH | Block --force on protected branches, require --force-with-lease, confirm dialog |

---

## Recommended Build Order

Based on dependency analysis across all research:

### Phase 1: Git Push UI (1-2 days)
**Rationale:** Zero backend work. Handler exists. Quick win establishes momentum.

**Delivers:**
- Push button in DiffPanel
- Ahead/behind indicator
- Success/failure toast
- Force-with-lease option with warning

**Pitfalls to avoid:** P11 (SSH auth), P12 (force push danger), P13 (remote confusion)

**Research flags:** None — straightforward wiring

### Phase 2: Multi-Tab Foundation (3-5 days)
**Rationale:** Highest complexity, foundational for other features, no external dependencies.

**Server (2 days):**
- `createThreadTab()` using tmux `new-window`
- `listThreadTabs()` using tmux `list-windows`
- `closeThreadTab()` using tmux `kill-window`
- Message handlers in session.ts

**Client (2-3 days):**
- TabStore (Zustand)
- TabBar component
- Multiple TerminalStreamAdapter instances
- Frame routing by streamId

**Pitfalls to avoid:** P1 (memory leak), P2 (session proliferation), P3 (state sync), P4 (resize), P15 (protocol changes), P16 (terminal manager refactor), P17 (reconnect)

**Research flags:** None — patterns well-documented in architecture research

### Phase 3: AI Chat Overlay (3-5 days)
**Rationale:** Uses existing AgentTimelineItem stream. No backend changes. Medium complexity parsing.

**Days 1-2:**
- ChatStore (Zustand)
- Subscribe to `agent_stream` events
- Timeline item → chat message mapping

**Days 3-4:**
- ChatOverlay component
- ChatBubble components (user, assistant, tool, reasoning)
- ChatInput with submit

**Day 5:**
- Toggle/position controls
- Integration with layout

**Pitfalls to avoid:** P5 (parsing edge cases), P6 (terminal/chat mismatch), P7 (parsing performance)

**Research flags:** **NEEDS RESEARCH** — OpenCode output format not fully documented. Need sample captures for parser development.

### Phase 4: Voice Input (2-3 days)
**Rationale:** Independent, uses existing dictation infrastructure. Can be deferred or parallelized.

**Day 1:**
- VoiceInput component with MediaRecorder
- Dictation stream messaging (use existing protocol)

**Day 2:**
- Handle transcription responses
- Insert text into chat input
- Visual feedback (recording indicator)

**Day 3 (optional):**
- Local Whisper container setup
- LocalWhisperSTTProvider

**Pitfalls to avoid:** P8 (Whisper resources), P9 (audio capture), P10 (voice UX)

**Research flags:** Container resource sizing needs validation. Start with OpenAI API, add local Whisper later.

---

## Open Questions

### Unresolved from Research

1. **OpenCode output format:** What exact patterns demarcate message boundaries? Need sample terminal recordings.
2. **Tab limits:** Should we cap tabs per thread? Architecture says 5, but UX research doesn't specify.
3. **Chat persistence:** Regenerate from terminal on each view, or persist ChatStore? Architecture says regenerate, but performance implications unclear.
4. **Voice model selection:** Start with OpenAI API or local Whisper? Research recommends API first.
5. **Split panes:** Listed as differentiator. Phase 2 or defer to v4?

### Decisions for Roadmap Phase

1. **Tmux windows vs sessions:** Architecture recommends windows. Confirm before implementation.
2. **Protocol versioning:** Handshake with capabilities or implicit? Architecture shows pattern but not mandatory.
3. **Force push policy:** Block entirely or confirm dialog? Pitfalls research recommends blocking on protected + confirm otherwise.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified via GitHub. Minimal additions needed. |
| Features | HIGH | Table stakes clear from competitor analysis (Warp, iTerm2, Cursor). |
| Architecture | HIGH | Verified against existing codebase. Most features use existing infrastructure. |
| Git Push | HIGH | Backend already implemented. UI-only work. |
| Multi-Tab | HIGH | Binary mux already supports multiple streamIds. Pattern clear. |
| Chat Overlay | MEDIUM | AgentTimelineItem is solid, but OpenCode-specific parsing needs iteration. |
| Voice Input | MEDIUM | Existing dictation infra is extensive, but container setup untested. |
| Pitfalls | HIGH | xterm.js issues verified via GitHub. SSH/git patterns documented. |

### Gaps to Address

- **OpenCode output samples:** Need actual terminal recordings for parser development.
- **Whisper container sizing:** Need to validate memory/CPU requirements in practice.
- **xterm.js dispose chain:** Verify correct cleanup sequence with addons.
- **Split pane complexity:** If included, needs deeper architecture research.

---

## Sources

### Primary (HIGH confidence)
- @xterm/xterm 6.0.0 — GitHub releases, docs (verified 2026-02-21)
- node-pty 1.1.0 — GitHub releases (verified 2026-02-21)
- diff2html 3.4.55 — GitHub releases (verified 2026-02-21)
- ansi_up 6.0.6 — GitHub (verified 2026-03-02)
- whisper-asr-webservice — Docker Hub (1M+ pulls, verified 2026-03-02)
- simple-git 3.x — GitHub (3.8k stars, verified 2026-03-02)
- Warp, iTerm2, Cursor, GitButler — Product analysis (2026-03-02)
- OpenAI Whisper docs — platform.openai.com (verified 2026-03-02)

### Codebase (HIGH confidence)
- binary-mux.ts, terminal-manager.ts, session.ts, messages.ts
- dictation-stream-manager.ts, speech providers
- agent-sdk-types.ts, timeline-projection.ts

### Issue Trackers (HIGH confidence)
- xterm.js #4935, #4645, #3889 (memory leak issues)

---

## Ready for Roadmap

Research synthesis complete. Key recommendations:

1. **Build order:** Git Push → Multi-Tab → Chat Overlay → Voice Input
2. **Most complex:** Multi-Tab (but architecture is solid)
3. **Most uncertain:** Chat Overlay (OpenCode parsing)
4. **Quickest win:** Git Push (UI only, 1-2 days)
5. **Critical pitfall:** xterm.js memory leaks — must test dispose chain before shipping multi-tab

Total estimated timeline: **2-3 weeks** for all four features.
