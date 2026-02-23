# Phase 03: Project & Thread Management - Research

**Researched:** 2026-02-22  
**Domain:** Multi-project thread lifecycle (git worktree + tmux + agent runtime + web sidebar UX)  
**Confidence:** HIGH

## Summary

Phase 3 should be planned as a first-class **thread orchestration layer** on top of already-stable Phase 2 transport. Keep WebSocket lifecycle/reconnect logic outside React components, and treat "thread switch" as re-binding the existing stream/attach protocol to a different terminal identity. Do not redesign terminal transport.

The backend already has most hard primitives: deterministic tmux session naming and managed terminals (`packages/server/src/terminal/terminal-manager.ts`), worktree creation/deletion and ownership safety (`packages/server/src/utils/worktree.ts`), async worktree bootstrap (`packages/server/src/server/worktree-bootstrap.ts`), provider registry/availability (`packages/server/src/server/agent/provider-manifest.ts`, `packages/server/src/shared/messages.ts`). The major gap is that terminal identity is still hardcoded to Phase 2 placeholder thread IDs in message schema and ensure-default flow (`packages/server/src/shared/messages.ts`, `packages/server/src/server/session.ts`).

UI should use shadcn sidebar blocks (locked decision), shadcn dialog/alert-dialog for create/delete flows, and a non-component external store boundary for connection + thread session state to preserve reconnect correctness. Thread creation should be an atomic lifecycle transaction: create worktree -> create/attach tmux terminal -> create/start agent -> switch active thread.

**Primary recommendation:** Implement a persisted Thread Registry on server, then route all terminal attach/input through concrete `projectId/threadId` identities (replacing `active` placeholder) while keeping Phase 2 stream attach/resume protocol unchanged.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `git worktree` orchestration (`packages/server/src/utils/worktree.ts`) | in-repo | Thread-isolated working directories | Already enforces Paseo-owned root, metadata, setup/destroy hooks, and safe deletion boundaries |
| Existing tmux terminal manager (`packages/server/src/terminal/terminal-manager.ts`) | in-repo | Long-lived terminal sessions per cwd | Already integrates deterministic session keys, lifecycle cleanup, and stream-ready terminal objects |
| shadcn/ui Sidebar (`SidebarProvider`, `Sidebar`, `SidebarGroup`, `SidebarMenu*`) | docs current (2026) | Mandatory sidebar system | Official composable pattern; includes controlled open state, keyboard toggle, mobile behavior |
| shadcn/ui Dialog + AlertDialog | docs current (2026) | Create thread modal + destructive delete confirmation | Radix-backed accessibility/focus/inert behavior; avoids custom modal bugs |
| React `useSyncExternalStore` | React 19.2 docs | Bridge external session/thread store into UI | Correct subscription semantics for non-React state; preserves WS lifecycle outside components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@xterm/xterm` | `^6.0.0` (workspace) | Active terminal renderer | Keep existing terminal panel; only rebind stream identity on thread switch |
| shadcn Sonner (`toast`) | docs current (2026) | Background exit/error notification | Required by locked decision: background thread exit/error toast |
| Existing provider availability API (`list_available_providers_request`) | in-repo | Agent selector options | Source of selectable provider availability per environment |
| Branch suggestions API (`listBranchSuggestions`) | in-repo | Base-branch picker (local + origin) | Already merges local/remote refs and ranks local first |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Sidebar blocks | Custom sidebar | Violates locked decision, higher a11y and responsive risk |
| External store + `useSyncExternalStore` | React-only component state | Increases reconnect/subscription race risk across rerenders and route/layout churn |
| Existing worktree APIs | Shelling raw `git worktree` per handler | Reintroduces safety gaps already handled (ownership checks, metadata, setup/destroy hooks) |

**Installation:**
```bash
bun --cwd packages/web add @radix-ui/react-dialog @radix-ui/react-alert-dialog @radix-ui/react-collapsible @radix-ui/react-tooltip sonner
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/
├── server/thread/
│   ├── thread-registry.ts        # Persisted project/thread metadata + active thread pointers
│   ├── thread-lifecycle.ts       # create/delete/switch transaction boundaries
│   └── session-reaper.ts         # orphan tmux/worktree cleanup
├── terminal/terminal-manager.ts  # thread-aware terminal ensure/lookup
├── shared/messages.ts            # project/thread RPC contracts
└── server/session.ts             # message handlers + stream attach routing

packages/web/src/
├── thread/thread-store.ts        # external store (projects, threads, active thread, unread)
├── components/app-sidebar.tsx    # shadcn sidebar composition
├── components/thread-dialog.tsx  # create thread dialog (inline errors)
├── components/delete-thread.tsx  # alert dialog with dirty-worktree confirmation
└── App.tsx                       # layout + terminal panel rebind on thread switch
```

### Pattern 1: Thread Lifecycle as a Transaction
**What:** Execute create flow in strict order and persist durable thread metadata only after terminal+agent startup succeeds (or persist provisional + compensating rollback).
**When to use:** `create_thread_request`.
**Example:**
```typescript
// Source: in-repo worktree + terminal + agent creation patterns
const worktree = await createAgentWorktree({ cwd: projectRoot, branchName, baseBranch, worktreeSlug });
const terminal = await terminalManager.createTerminal({ cwd: worktree.worktreePath, name: "Terminal 1" });
const agent = await agentManager.createAgent({ ...config, cwd: worktree.worktreePath, provider });
await threadRegistry.upsert({ projectId, threadId, worktreePath: worktree.worktreePath, terminalId: terminal.id, agentId: agent.id });
```

### Pattern 2: Switch by Stream Re-Attach, Not Terminal Recreate
**What:** Keep prior terminal session alive; switch active thread by attaching stream to selected thread terminal and updating active highlight/unread.
**When to use:** sidebar click, Cmd+Up/Down.
**Example:**
```typescript
// Source: existing attach_terminal_stream protocol
sendWsMessage({ type: "attach_terminal_stream_request", terminalId: next.terminalId, requestId, resumeOffset: 0 });
```

### Pattern 3: Destructive Delete Guarded by Dirty-Worktree Check
**What:** Detect uncommitted/untracked changes before delete; require extra confirmation when dirty.
**When to use:** delete thread action, always.
**Example:**
```bash
# Source: git-status porcelain format is stable for scripts
git status --porcelain=v1
```

### Pattern 4: Provider-Agnostic Thread Agent Config
**What:** Persist thread launch config as provider + command/mode metadata (not OpenCode-only fields) while defaulting UX to OpenCode first.
**When to use:** thread creation and restore/restart.
**Example:**
```typescript
type ThreadLaunchConfig = {
  provider: "opencode" | "claude" | "codex";
  modeId?: string | null;
  commandOverride?: { mode: "default" | "append" | "replace"; argv?: string[] };
};
```

### Anti-Patterns to Avoid
- **Phase-2 placeholder IDs:** do not keep `threadId: "active"` / `threadScope: "phase2-active-thread-placeholder"` in Phase 3 contracts.
- **Coupling ws lifecycle to sidebar component tree:** risks duplicate subscriptions and stale handlers.
- **Killing previous terminal on switch:** violates locked requirement to keep background terminal alive.
- **Direct shell calls for delete without ownership checks:** risks deleting non-Paseo worktrees.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar shell/layout | Custom collapsible nav | shadcn Sidebar primitives | Already handles state, mobile/desktop behavior, structure conventions |
| Modal focus/inert logic | Custom portal + key handlers | shadcn Dialog/AlertDialog (Radix) | Correct accessibility/focus trap + Escape semantics |
| Thread worktree safety | Ad-hoc `git worktree remove` wrappers | `deletePaseoWorktree` + ownership checks | Existing guardrails against non-Paseo path deletion |
| Provider command discovery | Hardcoded CLI checks per UI | `list_available_providers_response` + provider manifest | Single source of truth for available providers |
| Keyboard shortcut key normalization | Custom keycode map | `KeyboardEvent.key` + `metaKey`/`ctrlKey` | Standardized cross-browser behavior for ArrowUp/ArrowDown and Cmd/Ctrl modifier |

**Key insight:** Most Phase 3 risk is lifecycle consistency, not UI rendering. Reuse existing server primitives and only add missing thread identity/state layer.

## Common Pitfalls

### Pitfall 1: Partial Create Leaves Orphans
**What goes wrong:** worktree created but tmux/agent fails; orphan resources remain.
**Why it happens:** non-transactional create path.
**How to avoid:** compensating rollback (`closeAgent`, kill terminals under worktree, `deletePaseoWorktree`) on any create failure.
**Warning signs:** stale folders under `$PASEO_HOME/worktrees/*`, tmux sessions without thread record.

### Pitfall 2: Contract Drift Between Shared Messages and Handlers
**What goes wrong:** client/server compile but runtime rejects payloads.
**Why it happens:** `shared/messages.ts` not updated in lockstep with `session.ts` and web client message shapes.
**How to avoid:** add new project/thread schemas first; parse all outbound/inbound through shared zod schemas.
**Warning signs:** frequent `rpc_error` with `handler_error` or schema parse errors.

### Pitfall 3: Thread Switch Drops Background Output Semantics
**What goes wrong:** unread indicator/toast incorrect after switching.
**Why it happens:** no per-thread unseen-output bookkeeping.
**How to avoid:** increment unread per thread on output while inactive; clear on activation; toast on inactive thread exit/error.
**Warning signs:** unread dot never appears or never clears.

### Pitfall 4: Delete Confirmation Misses Dirty State
**What goes wrong:** user deletes thread with uncommitted work unintentionally.
**Why it happens:** delete dialog only confirms once.
**How to avoid:** preflight git dirty check and require explicit second confirmation for dirty worktrees.
**Warning signs:** delete succeeds without dirty warning despite `git status` entries.

### Pitfall 5: Tmux Naming Collisions Across Projects
**What goes wrong:** wrong terminal attaches due to non-unique session names.
**Why it happens:** session key derived from weak/non-unique identifiers.
**How to avoid:** deterministic key including project hash + thread slug; keep length bounded and sanitized.
**Warning signs:** thread A attaches into thread B output.

## Code Examples

Verified patterns from official sources:

### Shadcn Sidebar Composition
```tsx
// Source: https://ui.shadcn.com/docs/components/sidebar
<SidebarProvider>
  <Sidebar>
    <SidebarHeader />
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{/* project + thread rows */}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</SidebarProvider>
```

### Worktree List Parsing Contract
```bash
# Source: https://git-scm.com/docs/git-worktree
git worktree list --porcelain
```

### External Store Subscription in React
```tsx
// Source: https://react.dev/reference/react/useSyncExternalStore
const state = useSyncExternalStore(threadStore.subscribe, threadStore.getSnapshot)
```

### Keyboard Thread Navigation
```ts
// Source: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
// Source: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
window.addEventListener("keydown", (event) => {
  const isMacCombo = event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown")
  if (!isMacCombo) return
  event.preventDefault()
  // selectPrevThread / selectNextThread
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single placeholder terminal identity (`active`) | Real per-thread identity with persisted mapping | Phase 3 | Enables true multi-thread switching/unread/background state |
| Terminal bootstrap-only UX | Sidebar-driven thread orchestration | Phase 3 | Supports multiple parallel workstreams per project |
| Agent config coupled to immediate creation request | Persisted thread launch profile (provider + mode + branch) | Phase 3 | Makes restart/reaper/recovery deterministic |

**Deprecated/outdated:**
- `EnsureDefaultTerminalResponse` literal thread fields (`active`, `phase2-active-thread-placeholder`) in `packages/server/src/shared/messages.ts`.
- Phase-2 assumption that one cwd/session identity is sufficient for web UI.

## Recommended Implementation Approach

1. Replace placeholder thread identity in shared protocol with concrete thread payloads (`projectId`, `threadId`, `terminalId`, status, unread count).
2. Introduce server Thread Registry persistence (same durability model as `AgentStorage`) keyed by project and thread.
3. Implement create/delete/switch handlers in `session.ts` as transactional lifecycle orchestration reusing existing worktree/terminal/agent primitives.
4. Build shadcn sidebar + create/delete dialogs in web; keep ws/stream lifecycle in external store and rebind terminal stream on switch.
5. Add session reaper job to reconcile registry vs actual tmux/worktree resources and clean orphans.

## Files Likely Touched

- `packages/server/src/shared/messages.ts` (new project/thread RPC schemas; remove literal placeholder thread response types)
- `packages/server/src/server/session.ts` (thread CRUD/switch handlers; lifecycle orchestration)
- `packages/server/src/terminal/terminal-manager.ts` (thread-aware ensure/create lookup contract)
- `packages/server/src/utils/worktree.ts` (thread slug constraints, dirty checks helper reuse)
- `packages/server/src/utils/checkout-git.ts` (reuse branch suggestions and uncommitted status utilities)
- `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` + new phase-3 e2e tests (switching/delete/orphan cleanup)
- `packages/web/src/App.tsx` (split layout + active-thread-driven terminal attach)
- `packages/web/src/lib/ws.ts` or new `packages/web/src/thread/thread-store.ts` (external store integration)
- New shadcn components under `packages/web/src/components/ui/` and sidebar/thread dialog components
- `packages/web/package.json` (Radix/sonner deps if not already present)

## Dependency/Risk Notes

- **Dependency:** Phase 2 reconnect/stream semantics are stable and must remain untouched; thread switching must layer on top.
- **Dependency:** tmux and git CLI availability remain hard runtime dependencies for thread lifecycle.
- **Risk:** No existing explicit "configured project repos" source found in current server/web contracts; planner must define authoritative project registry source before task breakdown.
- **Risk:** Backward compatibility for existing clients expecting `ensure_default_terminal_response` literal thread fields; plan a schema/version migration step.
- **Risk:** Full monorepo typecheck OOM noted in STATE; verification plan should include workspace-level typechecks + targeted e2e.

## Concrete Constraints for Planner

- Preserve locked decisions from `03-CONTEXT.md` exactly (shadcn sidebar, top-level New Thread, inline dialog errors, auto-start + auto-switch, background-alive switching, Cmd+Up/Down, unread indicator, background exit/error toast, always-allowed delete with extra dirty confirmation).
- Do not regress Phase 2 reliability hardening: stale stream rejection, attach-cycle guarding, reconnect redraw logic.
- Do not hand-roll sidebar/modals/toasts; use shadcn primitives.
- Thread deletion must clean all three resources: worktree, tmux session(s), agent record/runtime.
- Architecture must keep provider abstraction (`opencode` first, but no provider-specific schema lock-in).
- Deterministic tmux naming must be collision-safe and stable across daemon restarts.

## Open Questions

1. **Authoritative project source for PROJ-01**
   - What we know: requirement says "configured git repos"; current contracts expose directory suggestions and per-agent project grouping, not a canonical configured repo list.
   - What's unclear: where configured repos are stored and mutated (server config file, daemon state, UI-managed persistence).
   - Recommendation: define explicit `projects` registry contract before planning implementation tasks.

2. **Canonical thread identity shape for API compatibility**
   - What we know: current schemas hardcode placeholder literals for thread fields.
   - What's unclear: migration/versioning strategy for existing clients.
   - Recommendation: introduce additive message fields first, then deprecate literals in a follow-up plan step.

## Sources

### Primary (HIGH confidence)
- Repo source: `packages/server/src/utils/worktree.ts` (worktree lifecycle/ownership/delete/setup)
- Repo source: `packages/server/src/terminal/terminal-manager.ts` (deterministic tmux session management)
- Repo source: `packages/server/src/server/session.ts` (current attach/ensure/stream lifecycle)
- Repo source: `packages/server/src/shared/messages.ts` (wire contracts and placeholder thread IDs)
- Repo source: `packages/server/src/utils/checkout-git.ts` (branch suggestions local+remote)
- https://ui.shadcn.com/docs/components/sidebar (sidebar structure/usage)
- https://ui.shadcn.com/docs/components/dialog (dialog usage)
- https://ui.shadcn.com/docs/components/alert-dialog (destructive confirm dialog)
- https://ui.shadcn.com/docs/components/sonner (toast integration)
- https://react.dev/reference/react/useSyncExternalStore (external store subscriptions)
- https://git-scm.com/docs/git-worktree (worktree porcelain/list/remove semantics)
- https://git-scm.com/docs/git-status (porcelain status for script-safe dirty checks)
- https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key (Arrow key handling)
- https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey (Cmd modifier handling)

### Secondary (MEDIUM confidence)
- https://www.radix-ui.com/primitives/docs/components/dialog (underlying dialog capabilities/a11y behavior)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - derived from locked decisions + in-repo implementation + official docs.
- Architecture: HIGH - mostly constrained by existing Phase 2/worker lifecycle code and current server primitives.
- Pitfalls: HIGH - directly observed from current placeholder contracts and known lifecycle edges in repo.

**Research date:** 2026-02-22  
**Valid until:** 2026-03-24 (30 days)
