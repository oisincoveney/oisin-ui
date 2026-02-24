# State: Oisin UI

## Project Reference

**Core Value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current Focus:** Milestone v1 closure complete; keep runtime verification evidence chain stable for future maintenance.
**Config:** standard depth · yolo mode · parallel execution

## Current Position

**Phase:** 05 of 5 (Docker Runtime Verification Closure)
**Plan:** 04 of 04
**Status:** Phase complete.
**Last activity:** 2026-02-24 - Completed 05-04-PLAN.md verification and milestone pass-state propagation.

```
Progress: [████████████████████] 100%
Phase 1:  ██████████ Complete
Phase 2:  ██████████ Complete
Phase 3:  █████ Complete (5/5)
Phase 4:  ██████████ Complete (6/6)
Phase 5:  ██████████ Complete (4/4)
```

## Performance Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Plans executed         | 28    |
| Plans passed           | 25    |
| Plans failed           | 3     |
| Total requirements     | 11    |
| Requirements complete  | 11    |
| Requirements remaining | 0     |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
| -------- | --------- | ----- |
| Keep WebSocket lifecycle outside React components | Prevent duplicate sockets and preserve reconnect semantics across rerenders | 01-05 |
| Build client WS URL from browser location + daemon port env | Allow LAN/container access without localhost assumptions | 01-06 |
| Use redraw-first reconnect flow with resume fallback | Guarantees terminal correctness after socket drops and stale offsets | 02-03 |
| Keep overlay pointer events disabled while disconnected | Preserve terminal text selection/copy during reconnect windows | 02-03 |
| Debounce resize propagation while fitting immediately in UI | Avoid tmux jitter while keeping streamed output uninterrupted | 02-03 |
| Correlate default terminal ensure by requestId + single-flight server ensure | Prevent bootstrap races from churning terminal IDs and breaking attach/input routing | 02-04 |
| Standardize daemon/web default endpoint on port 6767 with startup env propagation | Remove ws attach drift between runtime defaults and web fallback resolution | 02-05 |
| Disable speech providers in terminal smoke runtime | Keep e2e startup deterministic by avoiding local model bootstrap delays | 02-05 |
| Invalidate stream identity on reconnect transitions and accept attach responses only for active reconnect cycle | Prevent stale streamId reuse after reconnect/refresh churn | 02-06 |
| Gate adapter input on attach-confirmed active stream and keep server stale-stream rejection lifecycle-aware | Ensure post-reconnect input routes only to latest stream without permissive fallback | 02-06 |
| Exercise reconnect/refresh and reconnect+resize via deterministic client churn regressions with stale-stream warning assertions | Keep UAT stream-id drift and resize continuity blockers permanently covered by e2e gate | 02-07 |
| Use `projects.repositories` in persisted daemon config as canonical configured project source | Guarantees deterministic sidebar project source across restarts and avoids transient agent-derived drift | 03-01 |
| Persist thread identity in `$PASEO_HOME/thread-registry.json` with atomic temp-write + rename | Ensures durable project/thread metadata and minimizes corruption risk on write interruption | 03-01 |
| Keep legacy ensure-default terminal placeholder fields while adding additive concrete identity fields | Preserves existing client bootstrap compatibility during Phase 3 contract migration | 03-01 |
| Centralize thread create/switch/delete in a dedicated lifecycle service | Keeps rollback and cleanup behavior deterministic and testable across session handlers | 03-02 |
| Require explicit `forceDirtyDelete=true` when deleting dirty thread worktrees | Prevents accidental data loss while still allowing intentional destructive cleanup | 03-02 |
| Keep thread/session UI state in an external store exposed through `useSyncExternalStore` hooks | Preserves websocket lifecycle separation from component rerender churn while enabling sidebar/dialog orchestration | 03-03 |
| Rebind terminal stream by active thread terminal identity and keep previous thread running | Satisfies background-alive switching and maintains Phase 2 attach/input safety guarantees | 03-03 |
| Require second destructive confirmation in delete dialog when dirty-worktree error is returned | Prevents accidental deletion of uncommitted work while still permitting explicit forced cleanup | 03-03 |
| Start and stop ThreadSessionReaper from daemon bootstrap lifecycle | Ensures orphan reconciliation is always active and interval cleanup is deterministic on shutdown | 03-04 |
| Keep reaper cleanup conservative to Paseo-owned or registry-linked resources | Avoids deleting external tmux sessions/worktrees/agents not controlled by Paseo | 03-04 |
| Lock thread sidebar UX with browser regression specs for create/switch/wrap and background status toast | Prevents regressions in high-friction multi-thread interaction flows | 03-04 |
| Keep `thread_create` payload validation strict and typed with shared provider command schema | Ensures invalid baseBranch/command payloads surface explicit validation errors instead of being silently dropped | 03-05 |
| Propagate command override into provider-scoped agent session config during thread creation | Keeps New Thread command intent intact from UI payload through lifecycle launch configuration | 03-05 |
| Expose `thread.links.worktreePath` as nullable `worktreePath` in thread summaries | Ensures diff subscribers use true per-thread cwd and prevents cross-thread diff leakage | 04-01 |
| Preserve `listCheckoutFileChanges` ordering in checkout diff payloads | Keeps file list sequence aligned with git diff output instead of alphabetical reshuffling | 04-01 |
| Keep checkout diff websocket lifecycle in dedicated diff external store keyed by active subscriptionId | Prevents cross-thread diff updates and keeps socket logic out of React components | 04-02 |
| Bridge thread store active context into diff store during app bootstrap | Ensures diff subscriptions track active thread/worktree without component-owned websocket lifecycles | 04-02 |
| Persist diff panel width through local storage while keeping width state in diff-store | Preserves user-selected split ratio across reloads without moving ownership out of diff store | 04-03 |
| Close diff panel on active-thread transitions from app lifecycle | Guarantees thread switch resets panel visibility consistently for desktop and mobile | 04-03 |
| Map ParsedDiffFile payloads into diff2html JSON input with adapter-level context and hunk limits | Keeps git-ordered server payload fidelity while controlling browser render cost | 04-04 |
| Keep binary and too-large diff files summary-only in panel/sheet | Prevents broken hunk rendering for non-renderable payload states and preserves explicit UX | 04-04 |
| Guard diff-panel Playwright regression on active-thread availability | Avoids false negatives in empty local daemon bootstrap states while preserving coverage when thread context exists | 04-04 |
| Keep computeCheckoutDiffSnapshot as an order-preserving forwarder of getCheckoutDiff().structured output | Eliminates server-side alphabetical normalization that broke git-order truths | 04-05 |
| Assert subscribe/update/revisit diff ordering against git-derived expectations with non-alphabetic fixtures | Makes ordering regressions deterministic and catches any adapter/session path re-sorts | 04-05 |
| Keep rename metadata explicit as optional `oldPath` across shared/server/web parsed diff contracts | Removes rename label inference from display strings and preserves deterministic `old -> new` rendering | 04-06 |
| Derive diff2html language from renamed target file extension with plaintext fallback | Restores syntax-highlight fidelity without hardcoding `txt` for every file | 04-06 |
| Keep active-thread guard in diff-panel browser regression while asserting rename/highlight behavior when thread exists | Avoids false negatives in empty daemon state without silently dropping active-thread coverage | 04-06 |
| Block 05-02 verification-doc closure unless 05-01 records WS HTTP 101 and clean post-stop orphan result | Prevents falsifying DOCK-01 pass state when runtime checkpoint evidence fails | 05-01 |
| Keep phase verification and milestone audit in blocked state when runtime evidence fails closure criteria | Preserves audit integrity and prevents false 11/11 reporting | 05-02 |
| Run Docker gate runtime with `--no-relay --no-mcp` and speech features disabled by default | Removes daemon startup churn/refusal windows before websocket handshake checks | 05-03 |
| Use a single runtime-gate script to regenerate startup/handshake/stop evidence and fail on missing 101 or orphan checks | Keeps phase-05 closure evidence deterministic and reproducible at canonical artifact paths | 05-03 |
| Promote verification and milestone docs to pass-state only from fresh runtime artifacts | Prevents stale blocker language and keeps DOCK-01 closure evidence-backed | 05-04 |
| Preserve non-critical tech debt entries while clearing critical DOCK-01 blocker | Keeps milestone audit truthful by separating blocker closure from debt cleanup | 05-04 |

### Blockers

| Blocker | Impact | Status |
| ------- | ------ | ------ |
| Repo-wide `npm run typecheck` can OOM in this environment | Full monorepo typecheck is not reliable for verification in this shell | Ongoing environment issue; workspace-level typechecks and e2e coverage used for plan execution |
| Bun-driven vite/vitest startup intermittently fails with `esbuild` EPIPE in this shell | Blocks full browser e2e execution via Bun scripts despite code-level completion | Ongoing through 03-05; typechecks pass, daemon/web e2e entrypoints remain environment-blocked |
| Diff-panel browser regression requires active thread fixture to execute assertions | Targeted e2e can skip in empty daemon bootstrap state, reducing local verification strictness | Ongoing; seed an active thread fixture before running targeted diff-panel Playwright checks |

## Session Continuity

**Last session:** 2026-02-24 18:26 UTC
**Stopped at:** Completed 05-04-PLAN.md
**Resume file:** None

---

_State initialized: 2026-02-21_
_Last updated: 2026-02-24T18:26:43Z_
