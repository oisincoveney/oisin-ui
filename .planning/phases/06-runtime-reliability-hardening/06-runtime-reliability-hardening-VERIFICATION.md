# Phase 06 Runtime Reliability Verification

Last verified: 2026-02-25
Scope: RUN-01, RUN-02, RUN-03, RUN-04

## Deterministic command sequence

Run from repo root:

```bash
bun run --filter @getpaseo/server typecheck
bun run --filter @getpaseo/server test -- src/server/daemon-e2e/thread-management.e2e.test.ts
bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts
```

Pass gate:
- `typecheck` exits 0
- daemon e2e exits 0
- web e2e exits 0 with all tests passing

## Requirement evidence map

| Requirement | Status | Command evidence | Deterministic pass markers | Code evidence |
| --- | --- | --- | --- | --- |
| RUN-01 | Pass | `bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts` | Test title `restart warm-up locks actions and exposes bounded attach recovery indicator` passes; warm-up lock + retry banner assertions pass | `packages/server/e2e/thread-management-web.spec.ts:487` |
| RUN-02 | Pass | `bun run --filter @getpaseo/server test -- src/server/daemon-e2e/thread-management.e2e.test.ts` and `bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts` | Daemon test `bounds attach failures and does not emit infinite retry state for missing terminals` passes; web retry indicator window test passes | `packages/server/src/server/daemon-e2e/thread-management.e2e.test.ts:392`, `packages/server/e2e/thread-management-web.spec.ts:487` |
| RUN-03 | Pass | `bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts` | Tests `create thread exits pending with timeout error when create response never arrives` and `create thread exits pending immediately with disconnected error when websocket is offline` pass | `packages/server/e2e/thread-management-web.spec.ts:427`, `packages/server/e2e/thread-management-web.spec.ts:663` |
| RUN-04 | Pass | `bun run --filter @getpaseo/server test -- src/server/daemon-e2e/thread-management.e2e.test.ts` and `bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts` | Daemon test `active delete clears thread and stale attach attempts remain bounded` passes; web test `deleting the active thread immediately lands on no active thread` passes | `packages/server/src/server/daemon-e2e/thread-management.e2e.test.ts:445`, `packages/server/e2e/thread-management-web.spec.ts:603` |

## Truth checks

1. Restart/reconnect, attach recovery, create failure, and active delete checks run from automated tests and this deterministic command set. **Pass**.
2. Bounded behavior is asserted directly (timing/deadline/no-stale-retry invariants), not only happy-path reconnect. **Pass**.
3. Verification report can be marked pass/fail from a single reproducible sequence. **Pass**.

## Notes

- Plan task text references `packages/web/e2e/thread-management-web.spec.ts`; in this repo the executing file path is `packages/server/e2e/thread-management-web.spec.ts`.
- Plan verify command references `@getpaseo/web test:e2e`; in this repo the executable command is `bun run --filter @getpaseo/server test:e2e -- thread-management-web.spec.ts`.
