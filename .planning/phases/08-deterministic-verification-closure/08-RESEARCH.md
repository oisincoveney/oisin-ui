# Phase 08 Research: Deterministic Verification Closure

**Date:** 2026-02-27
**Phase:** 08 - Deterministic Verification Closure

## Current State Analysis

### VER-01: Diff-panel conditional skip

`packages/web/e2e/diff-panel.spec.ts` has a conditional skip path:
```js
if (!(await openPanelButton.isEnabled())) {
  test.skip(true, 'No active thread available for diff panel regression flow')
}
```

**Root cause:** The test is in `packages/web/e2e/` alongside `thread-sidebar.spec.ts`. Both use `PASEO_WEB_E2E_URL` (default localhost:44285) — they run against a live environment that may or may not have an active thread.

**No playwright.config.ts** in `packages/web/e2e/` — these tests need to be run from `packages/server` playwright infra or have their own config.

**Fix:** Move `diff-panel.spec.ts` to `packages/server/e2e/` and give it its own isolated runtime fixture (like `thread-management-web.spec.ts` does). The fixture must:
1. Spawn isolated daemon + web process with a dedicated `PASEO_HOME`
2. Create a project with a git repo
3. Create an active thread before the test via `DaemonClient`
4. Run the diff-panel test against that isolated runtime
5. Cleanup after

The `startRuntime()` + `createGitRepo()` + `writePersistedConfig()` pattern from `thread-management-web.spec.ts` is reusable.

### VER-02: Thread management create -> switch -> delete

`packages/server/e2e/thread-management-web.spec.ts` already has:
- `createThreadViaUi` helper
- Test for creating threads + keyboard switch (Cmd+Arrow)
- Test for deleting active thread

**Missing:** Explicit test for `create thread A -> create thread B (active) -> click to switch to A -> delete A -> "No active thread"`. The existing "deleting the active thread" test covers one case but not the full switch-then-delete flow.

**Fix:** Add new test `"create -> click-switch -> delete confirms no active thread"` to the existing `thread-management-web.spec.ts`.

### VER-03: Single command sequence

From STATE.md decisions: "Phase runtime verification is a single deterministic command chain (typecheck + daemon e2e + web e2e) mapped directly to RUN-01..RUN-04."

**Current commands:**
- `bun run --filter @getpaseo/server typecheck` (packages/server: tsc typecheck)
- `bun run --filter @oisin/web typecheck` (packages/web: tsc -b)
- `bun run --filter @getpaseo/server test` (vitest - unit + daemon e2e)
- `bun run --filter @getpaseo/server test:e2e` (playwright - thread-management-web.spec.ts, terminal-web-smoke.spec.ts)

**Problem:** After moving diff-panel.spec.ts to packages/server/e2e/, it will be covered by `test:e2e`. The single command chain is:
```
bun run --filter @getpaseo/server typecheck && bun run --filter @oisin/web typecheck && bun run --filter @getpaseo/server test && bun run --filter @getpaseo/server test:e2e
```

VER-03 requires this chain runs reliably and is documented. A Makefile target or README section makes it easy to invoke.

## Key Decisions

1. **Migrate diff-panel.spec.ts** from `packages/web/e2e/` to `packages/server/e2e/` with isolated runtime.
2. **Reuse `startRuntime` pattern** from `thread-management-web.spec.ts` (build daemon, spawn daemon + web, DaemonClient for setup).
3. **Active thread fixture for diff-panel:** Use `DaemonClient.createThread` to create an active thread before tests (same pattern as `ensureThread` in thread-management-web.spec.ts). Thread must be active so `openPanelButton` is enabled.
4. **VER-02 test:** Single new test in existing spec, uses `createThreadViaUi` helper, explicit click switch, then delete.
5. **VER-03 doc:** Add verification command to a `.planning/phases/08-deterministic-verification-closure/08-VERIFY-COMMANDS.md` or update ROADMAP phase. Also document in a `VERIFICATION.md` after execution.

## File Impact

| File | Action | Requirement |
|------|--------|-------------|
| `packages/web/e2e/diff-panel.spec.ts` | Delete (migrate) | VER-01 |
| `packages/server/e2e/diff-panel.spec.ts` | Create (with isolated runtime) | VER-01 |
| `packages/server/e2e/thread-management-web.spec.ts` | Add create->switch->delete test | VER-02 |
| `.planning/phases/08-.../08-VERIFY-COMMANDS.md` | Create (verification chain docs) | VER-03 |

## Risk / Notes

- `startRuntime` builds server from source each run — deterministic but slow (~60s). Acceptable for verification gate.
- Diff-panel test requires an active thread with git diffs visible. The fixture thread is on `main` branch — writing a file to the working directory from terminal is the current approach (`printf "const diffPanelValue = 123\n" > .paseo-diff-panel-e2e.ts`). This still works in isolated runtime since each runtime has its own git repo.
- `packages/web/e2e/thread-sidebar.spec.ts` also uses ambient env — NOT in scope for phase 08 (VER requirements don't cover it).
