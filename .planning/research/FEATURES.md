# Feature Research: AI Coding Agent Web UI

**Domain:** Self-hosted web UI for terminal-based AI coding agents
**Researched:** 2026-02-21
**Confidence:** HIGH (direct analysis of Codex App, Cursor, Windsurf, Aider, Continue.dev official docs/sites)

---

## Competitor Feature Analysis

### OpenAI Codex App (Primary Reference)
**Source:** developers.openai.com/codex/app/features (HIGH confidence)

| Feature | Notes |
|---------|-------|
| Multi-project sidebar | Switch between codebases in one window |
| Thread-based conversations | Each task is a thread, multiple per project |
| Git worktree support | Local, Worktree, and Cloud modes per thread |
| Integrated diff view | Git diff panel with inline commenting, stage/revert chunks |
| Integrated terminal per thread | Scoped to project/worktree, Cmd+J toggle |
| Commit, push, create PR | Built into the app — no leaving required |
| Skills system | Reusable agent skills (markdown-based prompts) |
| Automations | Scheduled/triggered tasks on worktrees |
| Voice dictation | Ctrl+M to speak prompts |
| Floating pop-out window | Detach thread into always-on-top window |
| IDE sync | Auto-sync with VS Code extension, shared context |
| Approval/sandboxing controls | Permission scopes for tool execution |
| MCP support | Shared across CLI/IDE/App |
| Web search | Built-in, live or cached |
| Image input | Drag-and-drop into prompt composer |
| Notifications | Background task completion alerts |
| Prevent-sleep toggle | Keep computer awake during tasks |
| Worktree cleanup | Auto-cleanup with snapshots after 4 days or >10 worktrees |
| Sync worktree ↔ local | Apply or overwrite in either direction |

**Layout:** Sidebar (projects/threads) → Center (chat/conversation) → Right (diff/review panel)

### Cursor
**Source:** cursor.com (HIGH confidence)

| Feature | Notes |
|---------|-------|
| Agent mode (Composer) | Full agentic coding with planning |
| Tab autocomplete | Specialized prediction model |
| Multi-model selection | GPT-5.2, Opus 4.6, Gemini 3 Pro, Grok Code |
| Codebase indexing | Semantic search across entire codebase |
| CLI tool | Terminal-based agent |
| BugBot (PR review) | AI code review on GitHub PRs |
| Slack integration | @cursor in Slack channels |
| Subagents | Spawn sub-tasks in parallel |
| Skills system | Reusable agent capabilities |
| Long-running background agents | Async tasks that persist |
| Plans feature | Task decomposition before coding |
| Plugins/Marketplace | Extensibility system |

**Layout:** VS Code fork — file explorer left, editor center, chat panel right

### Windsurf (Cognition/Codeium)
**Source:** docs.windsurf.com (HIGH confidence)

| Feature | Notes |
|---------|-------|
| Cascade (agentic chat) | Deep context-aware coding agent |
| Tab autocomplete | Fast inline predictions |
| Workflows | Automate repetitive trajectories |
| Memories/Rules | Persistent context customization |
| Context awareness | Instant codebase understanding |
| MCP support | Extend agent capabilities |
| Terminal integration | Enhanced terminal experience |
| App deploys | One-click deployment |
| Remote SSH/Dev containers | Connect to remote servers |
| VS Code import | Migrate settings and extensions |

**Layout:** VS Code fork — file explorer left, editor center, Cascade panel right

### Aider
**Source:** aider.chat/docs (HIGH confidence)

| Feature | Notes |
|---------|-------|
| Terminal-first interface | Pure CLI, runs in your terminal |
| Browser UI (experimental) | `--browser` flag launches web interface |
| Multi-LLM support | Almost any LLM, local models included |
| Repo map | Automatic codebase mapping |
| Auto git commits | Sensible commit messages |
| Voice-to-code | Speak changes |
| Image/web page context | Add visual references |
| IDE watch mode | Comment-driven changes in any editor |
| Lint/test integration | Auto-fix failures |
| Copy/paste web chat mode | Work with any LLM's web interface |
| Chat modes | Architect, code, ask modes |
| 100+ language support | Tree-sitter based parsing |

**Layout (browser):** Simple chat interface — no diff panel, no project sidebar

### Continue.dev
**Source:** github.com/continuedev/continue (HIGH confidence)

| Feature | Notes |
|---------|-------|
| CI-enforceable AI checks | Source-controlled agent checks in `.continue/checks/` |
| CLI tool (`cn`) | Open-source CLI for running checks |
| VS Code extension | IDE integration |
| Custom rules (markdown) | Define checks as natural language |

**Note:** Continue.dev has pivoted significantly toward CI/code-review tooling (source-controlled AI checks) rather than being a general coding agent UI. Less relevant as direct competitor now.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any AI coding agent web UI must have. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Multi-project sidebar** | Every tool has this (Codex, Cursor). Users work on >1 project | Med | Project config storage | Pull from git repos on disk |
| **Thread/conversation management** | Core UX paradigm across all tools. Each task = thread | Med | Project context | List, create, archive, rename threads |
| **Embedded terminal per thread** | This IS our agent interface. Without it, product is unusable | High | tmux session management, xterm.js | Most complex table-stakes feature |
| **Code diff view** | Codex, Cursor, Windsurf all show diffs. Users need to review changes | Med-High | Git integration, diff parsing | Side-by-side or unified diff display |
| **Git status/operations** | Commit, push visible from UI. All competitors do this | Med | Git CLI wrapper | Stage, unstage, commit, push |
| **WebSocket reliability** | Existing Paseo problem. Connection drops = unusable | Med | Relay architecture | Must reconnect gracefully |
| **Responsive dark theme** | Universal expectation in dev tools. All competitors use dark themes | Low | CSS/Tailwind | Codex reference design |
| **Agent output streaming** | Users expect to see agent output in real-time, not batched | Med | Terminal I/O capture, WebSocket | Stream tmux output to browser |
| **Thread status indicators** | Show if agent is running, idle, completed, errored | Low | Process monitoring | Badge/icon on thread list |

### Differentiators (Competitive Advantage for oisin-ui)

Features that set this product apart from alternatives. Not expected in every tool but provide clear value.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Git worktree isolation per thread** | Run parallel tasks without conflicts. Codex has this, but most tools don't. Combined with terminal-per-worktree, this is killer | High | Git worktree management, tmux per worktree | Core differentiator — Codex inspired |
| **Agent-agnostic (ANY CLI agent)** | Works with OpenCode, Claude Code, Aider, Codex CLI, any future agent. No vendor lock-in | Low (by design) | Terminal-based architecture | Biggest differentiator vs every competitor |
| **Self-hosted / Docker deployment** | Work from anywhere on your own infra. No SaaS dependency, no data leaving your server | Med | Docker packaging | Privacy/control story |
| **Codex-inspired 3-panel layout** | Best-in-class UX for agent work: sidebar + chat/terminal + diffs. Proven by Codex | Med | Layout components | Validated design pattern |
| **Worktree ↔ local sync** | Codex has this: apply worktree changes to your local checkout or vice versa | Med-High | Git operations | High value for review workflow |
| **Multiple agent sessions simultaneously** | Run tasks across projects in parallel. Codex has this, terminal tools don't | Med | Process orchestration | tmux makes this natural |
| **Direct terminal access** | Not just agent output — full interactive terminal. Run any command | Med | xterm.js + tmux attach | Aider/Codex CLI can't do this remotely |
| **Remote access from any device** | Access your dev environment from phone, tablet, any browser | Low (by design) | Relay/WebSocket | Core value prop |

### Anti-Features (Commonly Requested, Often Problematic)

Features to deliberately NOT build. Common mistakes in this domain.

| Anti-Feature | Why People Request It | Why Problematic for This Project | What to Do Instead |
|-------------|----------------------|--------------------------------|-------------------|
| **In-browser code editor (Monaco/CodeMirror)** | "I want to edit files in the browser" | Massive complexity, will never match VS Code/Cursor. You have a TERMINAL — use your actual editor via terminal | Provide terminal access where users can run vim/nano/emacs. Link to open files in local editor |
| **Built-in LLM API integration** | "Select a model and chat directly" | Duplicates what the CLI agent already does. Maintaining API integrations = massive ongoing burden. Paseo tried this and it's broken | Let the terminal agent handle model selection. Agent-agnostic means agent handles its own config |
| **Custom agent protocol (ACP/MCP)** | "Structured communication with agents" | Terminal approach works with ANY agent today. Protocol approach limits to compatible agents, adds fragility | Stay terminal-first. Scrape/parse terminal output if structured data needed |
| **Multi-user authentication** | "Let my team use it" | Single-user personal tool. Auth adds complexity for zero users who need it today | Revisit only if there's real demand. Docker means deploy per-user |
| **Mobile-native app** | "I want it on my phone" | Web UI works in mobile browser. Native app = separate codebase, app store hassle | Responsive web design. PWA if needed later |
| **Inline code completion/autocomplete** | "Tab complete like Cursor" | Requires deep editor integration that only works in an IDE. We're a terminal UI, not an IDE | This is what the agent + your IDE handles |
| **File tree/explorer** | "Show me the project files" | Adds complexity, duplicates what terminal `ls`/`tree` does. Not core to agent workflow | Terminal commands. Maybe a simple file browser later |
| **Voice input** | "Speak to my agent" | Nice-to-have at best, complex to implement (audio capture, transcription), low usage | Type in the terminal. Can add later if demand |
| **PR creation from UI** | "Create a PR with one click" | Involves GitHub API auth, token management, edge cases | Use `gh pr create` in the terminal. It's one command |
| **Codebase indexing/semantic search** | "Search my whole codebase" | Enormous complexity (embeddings, vector DB). Agent tools already do this | Let the CLI agent handle codebase understanding (aider's repo-map, Codex's indexing) |

---

## Feature Dependencies

```
Project Configuration (storage/git)
    └── Multi-Project Sidebar
         └── Thread Management (per project)
              ├── Git Worktree Creation (per thread)
              │    └── tmux Session (per worktree)
              │         └── Embedded Terminal (xterm.js → tmux)
              │              └── Agent Output Streaming
              │         └── Direct Terminal Interaction
              │    └── Git Diff View (per worktree)
              │         └── Stage/Unstage/Commit Operations
              │              └── Worktree ↔ Local Sync
              └── Thread Status Monitoring
                   └── Notifications (task complete/error)

WebSocket/Relay Layer (underlies everything)
    ├── Terminal I/O transport
    ├── Diff data transport
    └── State synchronization
```

**Critical path:** WebSocket reliability → Terminal embedding → Everything else.
Without reliable WebSocket, nothing works. Without terminal embedding, the product has no core value.

---

## MVP Definition

### MVP (Phase 1): Core Loop

The minimum that makes this useful as a daily driver:

1. **Multi-project sidebar** — see your projects, switch between them
2. **Thread creation per project** — create a new task, name it
3. **Git worktree per thread** — isolated branch/workspace
4. **Embedded terminal per thread** — xterm.js connected to tmux session in worktree
5. **Agent output visibility** — see what the agent is doing in the terminal
6. **Reliable WebSocket** — connection must stay alive, reconnect gracefully
7. **Dark theme, responsive layout** — Codex-inspired 2-panel minimum (sidebar + terminal)

**What's deliberately missing from MVP:**
- Diff view (use terminal `git diff`)
- Git operations UI (use terminal `git commit`)
- Worktree sync (use terminal `git` commands)
- Thread status beyond basic running/stopped
- Notifications

### Phase 2: Review & Diffs

8. **Code diff panel** — right panel showing uncommitted changes per worktree
9. **Stage/unstage chunks** — click to stage hunks, like Codex's diff pane
10. **Commit from UI** — message field + commit button
11. **Thread status indicators** — running/idle/complete/error badges
12. **3-panel Codex layout** — sidebar | terminal | diffs

### Phase 3: Polish & Power Features

13. **Worktree ↔ local sync** — apply/overwrite between worktree and main checkout
14. **Push/branch management** — push to remote, manage branches
15. **Thread archival & cleanup** — archive old threads, auto-cleanup worktrees
16. **Notifications** — desktop notifications on task completion
17. **Multiple terminal tabs** — switch between agent output and interactive shell
18. **Session persistence** — reconnect to exact same state after browser reload

---

## Feature Prioritization Matrix

| Feature | User Impact | Implementation Effort | Risk | Priority |
|---------|-------------|----------------------|------|----------|
| Reliable WebSocket | Critical | Medium | High (if not solved, nothing works) | **P0** |
| Embedded terminal (xterm.js + tmux) | Critical | High | Medium (well-known tech) | **P0** |
| Multi-project sidebar | High | Medium | Low | **P0** |
| Thread management | High | Medium | Low | **P0** |
| Git worktree per thread | High | Medium | Medium (cleanup, edge cases) | **P0** |
| Dark theme / Codex layout | Medium | Low-Medium | Low | **P1** |
| Agent output streaming | High | Medium | Medium (terminal parsing) | **P0** |
| Code diff panel | High | Medium-High | Medium (diff rendering) | **P1** |
| Git stage/commit UI | Medium | Medium | Low | **P1** |
| Thread status indicators | Medium | Low | Low | **P1** |
| Worktree ↔ local sync | Medium | Medium | Medium | **P2** |
| Notifications | Low-Medium | Low | Low | **P2** |
| Push/branch management | Medium | Medium | Low | **P2** |
| Session persistence | Medium | Medium | Medium (state management) | **P2** |
| Thread archival/cleanup | Low-Medium | Medium | Low | **P2** |

---

## Cross-Cutting Concerns

### Terminal Embedding is THE Make-or-Break Feature

Every competitor either IS a terminal (Codex CLI, Aider) or wraps an IDE (Cursor, Windsurf). Oisin-ui's entire value proposition rests on embedding a reliable, performant terminal in the browser that connects to tmux sessions on a remote server.

**What this means technically:**
- xterm.js must work flawlessly with tmux
- Terminal resizing must propagate correctly
- Unicode, colors, special characters must all work
- Input latency must be imperceptible
- Copy/paste must work naturally
- Connection interruptions must resume cleanly

**This is well-trodden ground** (ttyd, wetty, Gotty, VS Code terminal) but the integration with per-thread tmux sessions and the WebSocket relay adds unique complexity.

### Diff Rendering is Table Stakes but Not Trivial

Every competitor shows diffs. The user expectation (set by GitHub, VS Code, Codex) is:
- Side-by-side or unified view
- Syntax highlighting in diffs
- Collapse/expand file sections
- Stage individual hunks

This is a significant frontend effort. Libraries like `react-diff-viewer` or `diff2html` can help, but integrating with live worktree state and providing stage/unstage requires custom work.

### The "Any Agent" Story is the Key Differentiator

No other tool in this space is agent-agnostic:
- Codex only works with Codex/OpenAI
- Cursor only works with Cursor's agents
- Windsurf only works with Cascade
- Aider is its own agent
- Continue.dev is its own system

Oisin-ui works with ANY terminal-based agent. This means OpenCode, Claude Code, Codex CLI, Aider, custom scripts — anything you can run in a terminal. This is the single most important differentiator and the reason terminal-first architecture is the right call.

---

## Sources

| Source | URL | Confidence | Date Verified |
|--------|-----|------------|---------------|
| Codex App Features | developers.openai.com/codex/app/features | HIGH | 2026-02-21 |
| Codex Worktrees | developers.openai.com/codex/app/worktrees | HIGH | 2026-02-21 |
| Codex Overview | developers.openai.com/codex | HIGH | 2026-02-21 |
| Cursor Homepage | cursor.com/features | HIGH | 2026-02-21 |
| Windsurf Docs | docs.windsurf.com | HIGH | 2026-02-21 |
| Aider Usage Docs | aider.chat/docs/usage.html | HIGH | 2026-02-21 |
| Aider Browser UI | aider.chat/docs/usage/browser.html | HIGH | 2026-02-21 |
| Continue.dev GitHub | github.com/continuedev/continue | HIGH | 2026-02-21 |
| OpenAI Codex GitHub | github.com/openai/codex | HIGH | 2026-02-21 |
| Oisin-ui PROJECT.md | Local file | HIGH | 2026-02-21 |
