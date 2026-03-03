# Architecture Research: v3 TABS COOLERS

**Project:** Oisin UI v3 — Multi-tab terminals, AI chat overlay, voice input, git push
**Researched:** 2026-03-02
**Confidence:** HIGH (verified against existing codebase)

## Executive Summary

The existing Oisin UI architecture provides strong foundations for v3 features. The binary mux WebSocket protocol already supports multiple stream IDs, terminal manager handles session creation, and the agent timeline system provides structured AI output. Key integration points:

1. **Multi-tab:** Extend `streamId` multiplexing to N terminals per thread; add tab state to thread store
2. **AI chat:** Parse existing `AgentTimelineItem` from agent stream events; render as overlay
3. **Voice:** Existing dictation infrastructure handles Whisper STT via `SpeechToTextProvider`
4. **Git push:** Already implemented (`checkout_push_request`); needs UI wiring only

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Client                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ TerminalView │  │ ThreadStore  │  │  DiffStore   │           │
│  │  (xterm.js)  │  │  (Zustand)   │  │  (Zustand)   │           │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘           │
│         │                 │                                      │
│  ┌──────▼───────────────────────────┐                           │
│  │    TerminalStreamAdapter         │ ← single streamId         │
│  │    Binary Mux (24-byte header)   │                           │
│  └──────┬───────────────────────────┘                           │
└─────────┼───────────────────────────────────────────────────────┘
          │ WebSocket
┌─────────▼───────────────────────────────────────────────────────┐
│                         Server                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Session    │  │ AgentManager │  │TerminalMgr  │           │
│  │  (ws conn)   │  │ (AI agents)  │  │ (tmux PTY)  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│  ┌──────▼─────────────────▼─────────────────▼──────┐            │
│  │              ThreadLifecycle                     │            │
│  │     One tmux session per thread (currently)     │            │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Multi-Tab Architecture

### Current State

- **Binary mux:** 24-byte header with `streamId` field (uint32) — already supports multiple streams
- **Terminal manager:** Creates one session per thread via `ensureThreadTerminal()`
- **Thread store:** Tracks single `terminalId` per thread
- **TerminalStreamAdapter:** Manages one `streamId` at a time per adapter instance

### Server Changes

**Option A: Multiple tmux windows per session (Recommended)**

tmux sessions can have multiple windows. Each window is a separate shell with its own PTY.

```typescript
// Extend terminal-manager.ts
interface TerminalManager {
  // Existing
  ensureThreadTerminal(options: {
    projectId: string;
    threadId: string;
    cwd: string;
  }): Promise<{ terminal: TerminalSession; sessionKey: string }>;
  
  // New: create additional tabs within existing tmux session
  createThreadTab(options: {
    projectId: string;
    threadId: string;
    tabIndex?: number;  // specific index or next available
    tabName?: string;
    cwd?: string;  // defaults to thread cwd
  }): Promise<{ terminal: TerminalSession; tabIndex: number }>;
  
  listThreadTabs(projectId: string, threadId: string): Promise<ThreadTab[]>;
  closeThreadTab(projectId: string, threadId: string, tabIndex: number): void;
  switchThreadTab(projectId: string, threadId: string, tabIndex: number): void;
}

interface ThreadTab {
  tabIndex: number;
  terminalId: string;
  name: string;
  cwd: string;
}
```

**Implementation approach:**

```bash
# Create new window in session
tmux new-window -t {sessionKey}:{index} -n {tabName} -c {cwd}

# List windows
tmux list-windows -t {sessionKey} -F "#{window_index}:#{window_name}:#{pane_current_path}"

# Select window
tmux select-window -t {sessionKey}:{index}

# Kill window
tmux kill-window -t {sessionKey}:{index}
```

**Rationale:** tmux windows within a session share the session's environment while allowing separate shell instances. Maps cleanly to "tabs within a thread."

**New message schemas:**

```typescript
// messages.ts additions
export const CreateThreadTabRequestSchema = z.object({
  type: z.literal('create_thread_tab_request'),
  projectId: z.string(),
  threadId: z.string(),
  tabName: z.string().optional(),
  requestId: z.string(),
});

export const CreateThreadTabResponseSchema = z.object({
  type: z.literal('create_thread_tab_response'),
  payload: z.object({
    requestId: z.string(),
    terminalId: z.string(),
    tabIndex: z.number(),
    error: z.string().nullable(),
  }),
});

export const ListThreadTabsRequestSchema = z.object({
  type: z.literal('list_thread_tabs_request'),
  projectId: z.string(),
  threadId: z.string(),
  requestId: z.string(),
});

export const CloseThreadTabRequestSchema = z.object({
  type: z.literal('close_thread_tab_request'),
  projectId: z.string(),
  threadId: z.string(),
  tabIndex: z.number(),
  requestId: z.string(),
});
```

### Client Changes

**New TabStore (Zustand):**

```typescript
// stores/tab-store.ts
interface TabState {
  terminalId: string;
  tabIndex: number;
  name: string;
  streamId: number | null;  // null until attached
}

interface TabStoreState {
  // threadKey → tabs
  tabsByThread: Map<string, TabState[]>;
  // threadKey → active index
  activeTabIndex: Map<string, number>;
  
  // Actions
  addTab(threadKey: string, tab: TabState): void;
  removeTab(threadKey: string, tabIndex: number): void;
  setActiveTab(threadKey: string, tabIndex: number): void;
  setStreamId(threadKey: string, tabIndex: number, streamId: number): void;
}
```

**Multiple TerminalStreamAdapter instances:**

```typescript
// App.tsx changes
const adaptersRef = useRef<Map<string, Map<number, TerminalStreamAdapter>>>(new Map());
// Map: threadKey → Map<tabIndex, adapter>

// On tab switch:
function switchToTab(threadKey: string, tabIndex: number) {
  const activeAdapter = getActiveAdapter();
  activeAdapter?.setInputEnabled(false);
  
  const newAdapter = adaptersRef.current.get(threadKey)?.get(tabIndex);
  if (newAdapter) {
    newAdapter.setInputEnabled(true);
    newAdapter.getTerminal().focus();
  } else {
    // Create and attach
    const tab = tabStore.getTab(threadKey, tabIndex);
    sendAttachRequest(tab.terminalId);
  }
}
```

**Frame routing:**

```typescript
// Route by streamId to correct adapter
subscribeBinaryMessages((data) => {
  const frame = decodeBinaryMuxFrame(data);
  if (!frame) return;
  
  // Find adapter with matching streamId
  for (const [threadKey, adapters] of adaptersRef.current) {
    for (const [tabIndex, adapter] of adapters) {
      if (adapter.streamId === frame.streamId) {
        adapter.handleFrame(frame);
        return;
      }
    }
  }
});
```

### Protocol Changes

Binary mux already handles multiple streams. Key change:

**Multiple concurrent attach requests:**

```typescript
// Can have N active streams per connection
// Each tab gets its own attach_terminal_stream_request
// Each response has unique streamId
// Client maintains adapter per streamId
```

---

## AI Chat Overlay Architecture

### Current State

- **AgentTimelineItem:** Structured format for agent output (messages, tool calls, reasoning)
- **Timeline projection:** Server collapses tool lifecycle events, merges messages
- **agent_stream messages:** Server already sends structured events per agent

### Output Source: AgentTimelineItem Stream

The server already produces structured `AgentTimelineItem` via `agent_stream` messages:

```typescript
// Existing in messages.ts
export const AgentStreamMessageSchema = z.object({
  type: z.literal('agent_stream'),
  payload: z.object({
    agentId: z.string(),
    event: AgentStreamEventPayloadSchema,  // includes type: 'timeline'
    timestamp: z.string(),
    seq: z.number().optional(),
    epoch: z.string().optional(),
  }),
});

// AgentTimelineItem types (from agent-sdk-types.ts)
type AgentTimelineItem =
  | { type: 'user_message'; text: string; messageId?: string }
  | { type: 'assistant_message'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; callId: string; name: string; status: 'running'|'completed'|'failed'; detail: ToolCallDetail }
  | { type: 'todo'; items: Array<{ text: string; completed: boolean }> }
  | { type: 'error'; message: string }
  | { type: 'compaction'; status: 'loading'|'completed' };
```

**Integration approach — subscribe to existing stream:**

```typescript
// Already receiving these via subscribeTextMessages
if (msg.type === 'agent_stream' && msg.payload.agentId === activeAgentId) {
  if (msg.payload.event.type === 'timeline') {
    chatStore.addMessage(timelineItemToChatMessage(msg.payload.event.item));
  }
}
```

### ChatStore (New)

```typescript
// stores/chat-store.ts
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'reasoning' | 'error';
  content: string;
  status?: 'running' | 'completed' | 'failed' | 'canceled';
  timestamp: string;
  toolName?: string;
  toolDetail?: ToolCallDetail;
}

interface ChatStoreState {
  messagesByAgent: Map<string, ChatMessage[]>;
  
  addMessage(agentId: string, message: ChatMessage): void;
  updateMessage(agentId: string, messageId: string, updates: Partial<ChatMessage>): void;
  clearMessages(agentId: string): void;
}
```

### Chat Rendering

```typescript
// components/chat-overlay.tsx
interface ChatOverlayProps {
  agentId: string;
  position: 'right' | 'bottom' | 'floating';
  isMinimized: boolean;
  onSendMessage: (text: string) => void;
  onMinimize: () => void;
}

function ChatOverlay({ agentId, onSendMessage, ... }: ChatOverlayProps) {
  const messages = useChatStore((s) => s.messagesByAgent.get(agentId) ?? []);
  
  return (
    <ScrollArea>
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
    </ScrollArea>
    <ChatInput onSubmit={onSendMessage} />
  );
}
```

### Timeline Item to Chat Message Mapping

```typescript
function timelineItemToChatMessage(
  item: AgentTimelineItem,
  timestamp: string
): ChatMessage {
  const id = crypto.randomUUID();
  
  switch (item.type) {
    case 'user_message':
      return { id, type: 'user', content: item.text, timestamp };
      
    case 'assistant_message':
      return { id, type: 'assistant', content: item.text, timestamp };
      
    case 'reasoning':
      return { id, type: 'reasoning', content: item.text, timestamp };
      
    case 'tool_call':
      return {
        id,
        type: 'tool',
        content: formatToolCallSummary(item),
        status: item.status,
        timestamp,
        toolName: item.name,
        toolDetail: item.detail,
      };
      
    case 'error':
      return { id, type: 'error', content: item.message, timestamp };
      
    default:
      return { id, type: 'assistant', content: JSON.stringify(item), timestamp };
  }
}
```

### Input Handling — Two Paths

**Path A: Terminal input (existing)**
- User types in xterm.js
- Binary mux sends to tmux session
- Agent receives via stdin

**Path B: Chat input (new)**
- User types in chat input field
- Send `send_agent_message_request` via WebSocket
- Server routes to agent via AgentManager

```typescript
// Already exists in messages.ts
export const SendAgentMessageRequestSchema = z.object({
  type: z.literal('send_agent_message_request'),
  requestId: z.string(),
  agentId: z.string(),
  text: z.string(),
  messageId: z.string().optional(),
});
```

Both input paths work simultaneously. Chat is cleaner for multi-line prompts and image attachments.

---

## Voice Input Architecture

### Current State (Extensive)

Voice/dictation infrastructure already exists:

```typescript
// Server
- DictationStreamManager: Handles audio chunk streaming
- SpeechToTextProvider: Abstract interface for STT
- OpenAI Whisper: whisper-1, gpt-4o-transcribe models
- Local speech models: Download/manage models locally

// Messages already defined
DictationStreamStartMessageSchema
DictationStreamChunkMessageSchema
DictationStreamFinishMessageSchema
DictationStreamCancelMessageSchema
DictationStreamAckMessageSchema
DictationStreamFinalMessageSchema
DictationStreamErrorMessageSchema
```

### Container Setup (Optional Local Whisper)

Current setup uses OpenAI API. For local:

```yaml
# docker-compose.yml addition
services:
  whisper:
    image: fedirz/faster-whisper-server:latest
    ports:
      - "8000:8000"
    environment:
      WHISPER_MODEL: base.en
    volumes:
      - whisper-models:/root/.cache/huggingface
    # GPU acceleration (optional)
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

**New LocalWhisperSTTProvider:**

```typescript
// speech/providers/local-whisper/stt.ts
export class LocalWhisperSTTProvider implements SpeechToTextProvider {
  constructor(private endpoint: string = 'http://localhost:8000') {}
  
  async transcribe(audio: Buffer, format: string): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('file', new Blob([audio]), 'audio.webm');
    formData.append('model', 'base.en');
    
    const response = await fetch(`${this.endpoint}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });
    
    const result = await response.json();
    return { text: result.text, language: result.language };
  }
}
```

### Client Integration

```typescript
// components/voice-input.tsx
function VoiceInput({ onTranscription }: { onTranscription: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  
  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });
    
    const dictationId = crypto.randomUUID();
    dictationIdRef.current = dictationId;
    seqRef.current = 0;
    
    // Start dictation stream
    sendWsMessage({
      type: 'dictation_stream_start',
      dictationId,
      format: 'audio/webm;codecs=opus',
    });
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const base64 = await blobToBase64(event.data);
        sendWsMessage({
          type: 'dictation_stream_chunk',
          dictationId,
          seq: seqRef.current++,
          audio: base64,
          format: 'audio/webm;codecs=opus',
        });
      }
    };
    
    mediaRecorder.start(250);  // 250ms chunks
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  }
  
  function stopRecording() {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;
    
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    
    sendWsMessage({
      type: 'dictation_stream_finish',
      dictationId: dictationIdRef.current,
      finalSeq: seqRef.current - 1,
    });
    
    setIsRecording(false);
  }
  
  // Listen for transcription result
  useEffect(() => {
    return subscribeTextMessages((msg) => {
      if (msg.type === 'dictation_stream_final' && 
          msg.payload.dictationId === dictationIdRef.current) {
        onTranscription(msg.payload.text);
        dictationIdRef.current = null;
      }
    });
  }, [onTranscription]);
  
  return (
    <Button onClick={isRecording ? stopRecording : startRecording}>
      {isRecording ? <MicOff /> : <Mic />}
    </Button>
  );
}
```

### Integration Flow

```
Browser (MediaRecorder)
    │
    │ WebSocket (dictation_stream_chunk)
    ▼
DictationStreamManager (existing)
    │
    │ SpeechToTextProvider.transcribe()
    ▼
LocalWhisperSTTProvider ────────► Whisper Container
    │                                   │
    │ Transcription result              │
    ▼                                   ▼
Session ──────────────────────────────────
    │
    │ dictation_stream_final
    ▼
Client (inserts text into chat input)
```

---

## Git Push Architecture

### Current State — Already Implemented

**Server (existing):**

```typescript
// session.ts lines 4609-4635
private async handleCheckoutPushRequest(
  msg: Extract<SessionInboundMessage, { type: 'checkout_push_request' }>
): Promise<void> {
  const { cwd, requestId } = msg
  try {
    await pushCurrentBranch(cwd)
    this.emit({
      type: 'checkout_push_response',
      payload: { cwd, success: true, error: null, requestId },
    })
  } catch (error) {
    this.emit({
      type: 'checkout_push_response',
      payload: { cwd, success: false, error: this.toCheckoutError(error), requestId },
    })
  }
}
```

**Client (existing):**

```typescript
// daemon-client.ts
async checkoutPush(cwd: string, requestId?: string): Promise<CheckoutPushPayload>
```

### UI Changes Needed

**Add Push button to DiffPanel:**

```typescript
// diff-panel.tsx
function DiffPanel({ cwd, ... }: DiffPanelProps) {
  const [pushPending, setPushPending] = useState(false);
  
  async function handlePush() {
    setPushPending(true);
    const requestId = crypto.randomUUID();
    
    sendWsMessage({
      type: 'checkout_push_request',
      cwd,
      requestId,
    });
    
    // Response handled in useEffect
  }
  
  useEffect(() => {
    return subscribeTextMessages((msg) => {
      if (msg.type === 'checkout_push_response') {
        setPushPending(false);
        if (msg.payload.success) {
          toast.success('Pushed to remote');
          // Refresh checkout status
          refreshCheckoutStatus();
        } else {
          toast.error(`Push failed: ${msg.payload.error?.message ?? 'Unknown error'}`);
        }
      }
    });
  }, []);
  
  return (
    <Button onClick={handlePush} disabled={pushPending || !hasRemote}>
      {pushPending ? <Spinner /> : <GitBranch />}
      Push
    </Button>
  );
}
```

### Auth Handling

Git push uses system credentials:
- **SSH:** Docker mounts `~/.ssh:/root/.ssh:ro` (see docker-compose.yml)
- **HTTPS:** Git credential helper or environment variables
- No additional auth handling needed in application

---

## Data Flow Diagrams

### Multi-Tab Terminal Flow

```
User clicks "+" tab
       │
       ▼
sendWsMessage({ type: 'create_thread_tab_request', projectId, threadId })
       │
       ▼
Server: terminalManager.createThreadTab()
       │
       ├──► tmux new-window -t {sessionKey}
       │
       ▼
Response: { terminalId, tabIndex }
       │
       ▼
Client: tabStore.addTab(), setActiveTab()
       │
       ├──► Create new xterm.js Terminal
       ├──► Create new TerminalStreamAdapter
       │
       ├──► sendWsMessage({ type: 'attach_terminal_stream_request', terminalId })
       │
       ▼
Response: { streamId }
       │
       ▼
adapter.confirmAttachedStream(streamId)
       │
       ▼
Binary frames routed by streamId to correct adapter
```

### AI Chat Overlay Flow

```
Terminal runs OpenCode agent
       │
       ▼
AgentManager produces AgentTimelineItem[]
       │
       ▼
Session emits: { type: 'agent_stream', payload: { event: { type: 'timeline', item } } }
       │
       ▼
Client subscribeTextMessages()
       │
       ├──► Filter type === 'agent_stream' && event.type === 'timeline'
       │
       ▼
chatStore.addMessage(timelineItemToChatMessage(item))
       │
       ▼
ChatOverlay re-renders with new message
```

### Voice Input Flow

```
User clicks mic button
       │
       ▼
navigator.mediaDevices.getUserMedia({ audio: true })
       │
       ▼
MediaRecorder.ondataavailable (250ms chunks)
       │
       ├──► sendWsMessage({ type: 'dictation_stream_chunk', audio: base64 })
       │
       ▼
Server: DictationStreamManager.handleChunk()
       │
       ├──► Accumulate chunks
       │
       ▼
User stops recording → dictation_stream_finish
       │
       ├──► SpeechToTextProvider.transcribe()
       │
       ▼
Response: { type: 'dictation_stream_final', text }
       │
       ▼
Client inserts text into chat input
```

---

## Build Order (Dependency-Based)

### Phase 1: Git Push UI (1-2 days)
**Dependencies:** None — backend exists
**Tasks:**
1. Add Push button to DiffPanel
2. Wire to existing `checkout_push_request`
3. Handle response, show toast
4. Refresh checkout status on success

### Phase 2: Multi-Tab Foundation (3-5 days)
**Dependencies:** None — extends existing systems

**Server (2 days):**
1. Add `createThreadTab()` to terminal manager using tmux `new-window`
2. Add `listThreadTabs()` using tmux `list-windows`
3. Add `closeThreadTab()` using tmux `kill-window`
4. Add message handlers to session.ts

**Client (2-3 days):**
1. Create TabStore (Zustand)
2. TabBar component with +/close buttons
3. Multiple TerminalStreamAdapter management
4. Frame routing by streamId
5. Tab state in thread store

### Phase 3: AI Chat Overlay (3-5 days)
**Dependencies:** Multi-tab helpful but not blocking

**Day 1-2:**
1. Create ChatStore (Zustand)
2. Subscribe to `agent_stream` events
3. Timeline item → chat message mapping

**Day 3-4:**
1. ChatOverlay component
2. ChatBubble components (user, assistant, tool, reasoning)
3. ChatInput with submit

**Day 5:**
1. Toggle/position controls (right, bottom, floating)
2. Minimize/maximize
3. Integration with existing layout

### Phase 4: Voice Input (2-3 days)
**Dependencies:** AI Chat overlay (for input target)

**Day 1:**
1. VoiceInput component with MediaRecorder
2. Dictation stream messaging

**Day 2:**
1. Handle transcription responses
2. Insert text into chat input
3. Visual feedback (recording indicator, waveform)

**Day 3 (optional):**
1. Local Whisper container setup
2. LocalWhisperSTTProvider

### Recommended Sequence

```
Week 1: Git Push UI (done) + Multi-Tab Foundation (in progress)
Week 2: Multi-Tab Completion + AI Chat Overlay
Week 3: Voice Input + Integration Testing
```

---

## Component Boundaries

| Component | Package | Responsibility | Status |
|-----------|---------|----------------|--------|
| TerminalManager | server | tmux session/window lifecycle | Exists, extend |
| Session | server | WebSocket message handling | Exists, add handlers |
| DictationStreamManager | server | Audio streaming to STT | Exists |
| SpeechToTextProvider | server | STT abstraction | Exists |
| ThreadStore | web | Thread state | Exists |
| TabStore | web | Tab state within threads | **NEW** |
| ChatStore | web | AI chat messages | **NEW** |
| TerminalStreamAdapter | web | Binary mux frame handling | Exists, instance per tab |
| TabBar | web | Tab UI | **NEW** |
| ChatOverlay | web | AI chat rendering | **NEW** |
| VoiceInput | web | MediaRecorder + dictation | **NEW** |
| DiffPanel | web | Diff view + git actions | Exists, add push button |

---

## Integration Points Summary

| Feature | Server Integration | Client Integration | Status |
|---------|-------------------|-------------------|--------|
| Multi-tab | TerminalManager (tmux windows) | TabStore, multiple adapters | New |
| AI chat | AgentManager stream subscription | ChatStore, ChatOverlay | New (uses existing) |
| Voice | DictationStreamManager | MediaRecorder, VoiceInput | New (uses existing) |
| Git push | Session (existing handler) | DiffPanel button | UI only |

---

## Risk Areas

1. **Multi-tab tmux complexity:** Window management across disconnects/reconnects needs careful state sync
2. **Agent stream subscription:** Must handle agent restarts, thread switches, timeline gaps
3. **Voice audio formats:** Browser codec support varies (prefer webm/opus, fallback to pcm)
4. **Chat/terminal input sync:** Both paths must work, ensure consistent UX

---

## Sources

- **Codebase analysis:** binary-mux.ts, terminal-manager.ts, session.ts, messages.ts
- **Existing implementations:** dictation-stream-manager.ts, speech providers
- **Docker setup:** docker-compose.yml, Dockerfile
- **Agent timeline:** timeline-projection.ts, agent-sdk-types.ts

---

## Previous Architecture Context

For full system architecture (daemon, terminal manager, binary mux, worktrees), see the original ARCHITECTURE.md content that documents the foundational patterns. This document focuses specifically on v3 TABS COOLERS feature integration.
