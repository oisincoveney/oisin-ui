---
phase: 004-fix-v2-tech-debt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/server/src/server/thread/thread-registry.test.ts
  - packages/web/src/diff/diff-store.ts
  - packages/web/src/components/diff-panel.tsx
autonomous: true

must_haves:
  truths:
    - "sessionKey is never persisted to SQLite (in-memory only)"
    - "Stage/unstage success shows toast feedback"
  artifacts:
    - path: "packages/server/src/server/thread/thread-registry.test.ts"
      provides: "Test verifying sessionKey is in-memory only"
      contains: "session_key"
    - path: "packages/web/src/diff/diff-store.ts"
      provides: "Stage/unstage response listener exports"
      exports: ["subscribeStageResponses"]
    - path: "packages/web/src/components/diff-panel.tsx"
      provides: "Toast feedback on stage/unstage"
      contains: "toast.success"
  key_links:
    - from: "diff-store.ts"
      to: "diff-panel.tsx"
      via: "subscribeStageResponses callback"
---

<objective>
Fix two v2 tech debt items from audit:
1. Add explicit test verifying sessionKey is in-memory only (not persisted to SQLite)
2. Handle checkout_stage_response/checkout_unstage_response with success toast feedback

Note: Item #1 from original audit ("dead code in bootstrap.ts:293") was verified as already fixed/non-existent.

Purpose: Close tech debt gaps identified in v2 code review audit.
Output: One new test + stage/unstage toast feedback wiring.
</objective>

<execution_context>
@~/.config/Claude/get-shit-done/workflows/execute-plan.md
@~/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/server/src/server/thread/thread-registry.test.ts
@packages/web/src/diff/diff-store.ts
@packages/web/src/components/diff-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sessionKey in-memory only test</name>
  <files>packages/server/src/server/thread/thread-registry.test.ts</files>
  <action>
Add a new test case to the "ThreadRegistry (SQLite)" describe block:

```typescript
it("sessionKey is in-memory only (not persisted to DB)", async () => {
  await registry.createThread(makeThreadInput());
  await registry.updateThread({
    projectId: "proj-1",
    threadId: "thread-1",
    links: { sessionKey: "session-abc" },
  });
  
  // Verify sessionKey is accessible via thread API
  const thread = await registry.getThread("proj-1", "thread-1");
  expect(thread?.links.sessionKey).toBe("session-abc");
  
  // Verify sessionKey is NOT in the database
  const row = await getDb().get<{ session_key: string | null }>(
    "SELECT session_key FROM threads WHERE project_id = ? AND thread_id = ?",
    "proj-1",
    "thread-1"
  );
  // session_key column should not exist or be null (schema doesn't include it)
  expect(row?.session_key).toBeUndefined();
});
```

This test explicitly asserts the design decision from STATE.md: "sessionKey and agentId remain runtime-only (not persisted in DB schema)".
  </action>
  <verify>Run `bun test thread-registry.test.ts` — new test passes</verify>
  <done>Test explicitly verifies sessionKey is in-memory only via direct DB query</done>
</task>

<task type="auto">
  <name>Task 2: Add stage/unstage response toast feedback</name>
  <files>packages/web/src/diff/diff-store.ts, packages/web/src/components/diff-panel.tsx</files>
  <action>
**In diff-store.ts:**

1. Add stage response listeners set (similar to commitResponseListeners):
```typescript
const stageResponseListeners = new Set<
  (payload: {
    cwd: string
    path: string
    success: boolean
    error: { code: string; message: string } | null
    requestId: string
  }) => void
>()
```

2. Update handleDiffSessionMessage case for stage/unstage responses (lines 239-241):
```typescript
case 'checkout_stage_response':
case 'checkout_unstage_response': {
  const payload = message.payload as {
    cwd: string
    path: string
    success: boolean
    error: { code: string; message: string } | null
    requestId: string
  }
  for (const listener of stageResponseListeners) {
    listener(payload)
  }
  return
}
```

3. Export subscribe function:
```typescript
export function subscribeStageResponses(
  listener: (payload: {
    cwd: string
    path: string
    success: boolean
    error: { code: string; message: string } | null
    requestId: string
  }) => void,
): () => void {
  stageResponseListeners.add(listener)
  return () => {
    stageResponseListeners.delete(listener)
  }
}
```

**In diff-panel.tsx:**

1. Import `subscribeStageResponses` alongside existing imports from diff-store
2. Add useEffect to subscribe and show toast:
```typescript
useEffect(() => {
  return subscribeStageResponses((payload) => {
    if (payload.success) {
      toast.success(`${payload.path} staged`)
    } else {
      toast.error(payload.error?.message ?? 'Stage/unstage failed')
    }
  })
}, [])
```

Toast message should distinguish staged vs unstaged if possible (check message.type), or use generic "staged/unstaged" wording.
  </action>
  <verify>
1. `bun run typecheck` passes
2. Manual test: stage a file in browser → success toast appears
3. Manual test: unstage a file → success toast appears
  </verify>
  <done>Stage/unstage operations now show success toast feedback to user</done>
</task>

</tasks>

<verification>
- `bun test thread-registry.test.ts` — sessionKey test passes
- `bun run typecheck` — no type errors
- Manual: stage file in browser → toast shows
- Manual: unstage file in browser → toast shows
</verification>

<success_criteria>
- [ ] sessionKey in-memory test added and passing
- [ ] Stage/unstage responses trigger toast feedback
- [ ] No type errors
</success_criteria>

<output>
After completion, create `.planning/quick/004-fix-v2-tech-debt/004-SUMMARY.md`
</output>
