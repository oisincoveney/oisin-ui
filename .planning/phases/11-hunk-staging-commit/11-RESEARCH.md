# Phase 11: Hunk Staging & Commit - Research

**Researched:** 2026-03-02
**Domain:** File-level git staging/unstaging with commit from browser UI
**Confidence:** HIGH

## Summary

Phase 11 implements file-level staging (`git add <path>`), unstaging (`git restore --staged <path>`), and commit functionality. Despite the phase name mentioning "hunk staging", the CONTEXT.md explicitly constrains scope to **file-level** operations only — matching VS Code source control panel behaviour.

The existing infrastructure is well-positioned: the daemon already has `checkout_commit_request` with `addAll` support, diff subscriptions automatically refresh after commit, and the web diff panel already shows separate Staged/Unstaged sections with file rows. The missing pieces are: (1) new backend message types for stage/unstage single file, (2) wire commit form to existing backend endpoint, (3) add stage/unstage buttons to file row header.

Key architectural constraint: wait for server push after staging/unstaging — no optimistic UI. Server triggers diff subscription refresh after each action (same pattern as post-commit today).

**Primary recommendation:** Add `checkout_stage_request` and `checkout_unstage_request` message types to server session, implement as thin wrappers around `git add`/`git restore --staged`, and connect UI buttons in DiffFileSection header bar.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing session message infrastructure | in-repo | Request/response pattern with subscription refresh | Already handles commit; extend for stage/unstage |
| `sonner` (toast) | ^1.0 | Error/success feedback | Already integrated via `toast()` from sonner |
| ShadCN Button | existing | Stage/Unstage button UI | Locked constraint: ShadCN only |
| lucide-react | existing | Icons (Plus, Minus, Check) | Already used in diff-panel.tsx, diff-file-section.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing diff-store.ts | in-repo | Subscription lifecycle, cache refresh | Stage/unstage triggers diff refresh via existing pattern |
| Existing ws.ts | in-repo | sendWsMessage for new request types | Same pattern as commit |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New message types | Extend commit with partial staging | Commit endpoint semantics differ; cleaner to add dedicated stage/unstage |
| Wait for server push | Optimistic UI | CONTEXT.md explicitly requires wait for server; more complex rollback logic |

**Installation:**
```bash
# No new dependencies needed — leverage existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/
├── shared/messages.ts           # Add CheckoutStageRequest/Response, CheckoutUnstageRequest/Response
├── server/session.ts            # Add handleCheckoutStageRequest, handleCheckoutUnstageRequest
├── utils/checkout-git.ts        # Add stageFile(), unstageFile() git wrappers

packages/web/src/
├── diff/diff-store.ts           # Add sendStageRequest(), sendUnstageRequest(), sendCommitRequest()
├── components/diff-panel.tsx    # Wire commit form to sendCommitRequest()
└── components/diff-file-section.tsx  # Add Stage/Unstage button in header bar
```

### Pattern 1: Session Message Request/Response
**What:** Correlated request with requestId, response with success/error, subscription refresh trigger
**When to use:** All stage/unstage/commit operations
**Example:**
```typescript
// Source: existing patterns in packages/server/src/shared/messages.ts
export const CheckoutStageRequestSchema = z.object({
  type: z.literal('checkout_stage_request'),
  cwd: z.string(),
  path: z.string(),
  requestId: z.string(),
})

export const CheckoutStageResponseSchema = z.object({
  type: z.literal('checkout_stage_response'),
  payload: z.object({
    cwd: z.string(),
    path: z.string(),
    success: z.boolean(),
    error: CheckoutErrorSchema.nullable(),
    requestId: z.string(),
  }),
})
```

### Pattern 2: Git Command Wrappers in checkout-git.ts
**What:** Async functions wrapping execFileAsync for git operations
**When to use:** All git write operations
**Example:**
```typescript
// Source: existing commitChanges pattern in checkout-git.ts
export async function stageFile(cwd: string, path: string): Promise<void> {
  await requireGitRepo(cwd);
  await execFileAsync("git", ["add", "--", path], { cwd });
}

export async function unstageFile(cwd: string, path: string): Promise<void> {
  await requireGitRepo(cwd);
  await execFileAsync("git", ["restore", "--staged", "--", path], { cwd });
}
```

### Pattern 3: Subscription Refresh After Mutation
**What:** After successful mutation, call scheduleCheckoutDiffRefreshForCwd() to trigger diff update
**When to use:** After stage, unstage, and commit operations
**Example:**
```typescript
// Source: existing handleCheckoutCommitRequest in session.ts (line 4391)
await stageFile(cwd, path);
this.scheduleCheckoutDiffRefreshForCwd(cwd);
```

### Pattern 4: Toast Feedback for Errors
**What:** Use sonner toast for commit failures
**When to use:** Commit failure (not stage/unstage — those silently update diff)
**Example:**
```typescript
// Source: existing toast usage in App.tsx
import { toast } from 'sonner'
toast.error('Commit failed: ' + error.message)
```

### Anti-Patterns to Avoid
- **Optimistic UI updates before server confirmation:** CONTEXT.md explicitly forbids this; wait for subscription refresh
- **Inline editing of commit message in header:** Commit bar is separate; button disabled until message non-empty
- **Manual cache invalidation:** Let existing subscription refresh pattern handle it
- **Preserving file expand state across stage/unstage:** Files collapse when moved between sections

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Correlated request/response | Custom correlation | Existing requestId pattern from messages.ts | Already handles timeouts, error codes |
| Diff refresh after mutation | Manual cache clear | scheduleCheckoutDiffRefreshForCwd() | Already debounced, handles multiple subscriptions |
| Toast notifications | Custom alert UI | sonner toast() | Already styled, integrated with theme |
| Button loading state | Custom spinner | Button disabled + spinner during request | Simpler UX per CONTEXT.md discretion |

**Key insight:** This phase is primarily wiring — connecting new UI buttons to new backend endpoints that follow identical patterns to existing commit endpoint.

## Common Pitfalls

### Pitfall 1: Untracked Files and `git restore --staged`
**What goes wrong:** `git restore --staged` fails on untracked files that were staged with `git add`
**Why it happens:** Untracked-then-staged files aren't in HEAD, so restore has nothing to restore from
**How to avoid:** Use `git reset HEAD -- <path>` instead of `git restore --staged` (works for both cases)
**Warning signs:** "pathspec did not match any file(s)" error on unstage

### Pitfall 2: Renamed Files Path Handling
**What goes wrong:** Stage/unstage button uses wrong path for renamed files
**Why it happens:** Renamed files have both `path` (new) and `oldPath` (old) in ParsedDiffFile
**How to avoid:** For staged renames, unstage by path (new name). For unstaged renames, stage by path.
**Warning signs:** "pathspec not found" errors on renamed files

### Pitfall 3: Deleted Files Staging
**What goes wrong:** Staging a deleted file fails with "pathspec not found"
**Why it happens:** `git add` expects file to exist for untracked; deleted tracked files need `git add` or `git rm`
**How to avoid:** `git add --all -- <path>` handles deletions; or use `git add -u` semantics
**Warning signs:** "pathspec did not match" on deleted file stage

### Pitfall 4: Race Between Button Click and Subscription Refresh
**What goes wrong:** User clicks stage, file disappears, clicks again on stale UI
**Why it happens:** Subscription refresh is async; UI might still show old state
**How to avoid:** Disable button during pending request (loading state)
**Warning signs:** Double-stage attempts, console errors about already-staged paths

### Pitfall 5: Empty Commit on Staged Files
**What goes wrong:** Commit button enabled but commit fails with "nothing to commit"
**Why it happens:** User unstaged all files after typing message
**How to avoid:** Disable commit button if stagedFiles.length === 0
**Warning signs:** "nothing to commit" error after clicking enabled commit button

## Code Examples

Verified patterns from official sources:

### Git stage file command
```bash
# Source: git-add(1) manual
git add -- <pathspec>           # Stage file (handles new, modified, deleted)
git add --all -- <pathspec>     # Stage including removals (safest for all cases)
```

### Git unstage file command  
```bash
# Source: git-reset(1) manual
git reset HEAD -- <pathspec>    # Unstage file (works for all cases including new files)
# Note: git restore --staged fails on newly-added files not in HEAD
```

### Existing commit endpoint handler (model for stage/unstage)
```typescript
// Source: packages/server/src/server/session.ts lines 4373-4412
private async handleCheckoutCommitRequest(
  msg: Extract<SessionInboundMessage, { type: 'checkout_commit_request' }>
): Promise<void> {
  const { cwd, requestId } = msg
  try {
    await commitChanges(cwd, { message, addAll: msg.addAll ?? true })
    this.scheduleCheckoutDiffRefreshForCwd(cwd)
    this.emit({ type: 'checkout_commit_response', payload: { cwd, success: true, error: null, requestId } })
  } catch (error) {
    this.emit({ type: 'checkout_commit_response', payload: { cwd, success: false, error: this.toCheckoutError(error), requestId } })
  }
}
```

### Existing diff file section header (add button here)
```typescript
// Source: packages/web/src/components/diff-file-section.tsx lines 62-98
<CollapsibleTrigger
  data-testid="diff-file-row"
  className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/35"
>
  <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
  <div className="min-w-0 flex-1">
    {/* file path and stats */}
  </div>
  <ChevronDown className={cn(...)} />
  {/* ADD: Stage/Unstage button before ChevronDown */}
</CollapsibleTrigger>
```

### Commit form UI pattern (already exists, needs wiring)
```typescript
// Source: packages/web/src/components/diff-panel.tsx lines 97-102
<form className="flex gap-2 px-3 py-2">
  <Input placeholder="Commit message" disabled className="h-8 flex-1 text-sm" />
  <Button type="submit" size="sm" disabled>Commit</Button>
</form>
// Note: Currently disabled — need to wire onSubmit, controlled input, and enabled state
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser-side git operations | Server-side git via session messages | Phase 04 | Consistent, secure, works with worktrees |
| Polling for diff updates | Push subscription with debounced refresh | Phase 04/09 | Realtime updates without polling overhead |
| Custom button components | ShadCN Button with lucide icons | AGENTS.md constraint | Consistent styling, enforced by plugin |

**Deprecated/outdated:**
- Direct git commands from browser (not applicable in this architecture)
- Optimistic UI for git mutations (explicitly rejected in CONTEXT.md)

## Open Questions

1. **Icon choice for Stage/Unstage buttons**
   - What we know: CONTEXT.md says "small ghost/outline button with an icon"
   - What's unclear: Exact icon (Plus/Minus? Check/X? Arrow?)
   - Recommendation: Use `Plus` for Stage, `Minus` for Unstage (intuitive add/remove metaphor)

2. **Loading indicator during stage/unstage**
   - What we know: CONTEXT.md marks this as "Claude's discretion"
   - What's unclear: Whether to show spinner or just disable
   - Recommendation: Disable button only (simpler, consistent with commit button pattern)

3. **Error handling for stage/unstage failures**
   - What we know: Commit failure shows toast, input preserved
   - What's unclear: Whether stage/unstage failures need toast
   - Recommendation: Silent retry or console.error for stage/unstage; toast only for commit

## Sources

### Primary (HIGH confidence)
- Repo source: `packages/server/src/server/session.ts` - existing handleCheckoutCommitRequest pattern
- Repo source: `packages/server/src/utils/checkout-git.ts` - existing commitChanges, git command patterns
- Repo source: `packages/server/src/shared/messages.ts` - existing message schema patterns
- Repo source: `packages/web/src/components/diff-panel.tsx` - current commit form UI
- Repo source: `packages/web/src/components/diff-file-section.tsx` - current file row structure
- Repo source: `packages/web/src/diff/diff-store.ts` - subscription and refresh patterns
- Phase context: `.planning/phases/11-hunk-staging-commit/11-CONTEXT.md` - locked decisions

### Secondary (MEDIUM confidence)
- git-add(1) manual: staging semantics
- git-reset(1) manual: unstaging semantics
- Existing e2e: `packages/server/e2e/diff-panel.spec.ts` - test patterns

### Tertiary (LOW confidence)
- None — all findings verified against in-repo sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, extend existing patterns
- Architecture: HIGH - follows identical pattern to commit endpoint
- Pitfalls: MEDIUM - git edge cases (renamed files, untracked) need careful handling

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (30 days)
