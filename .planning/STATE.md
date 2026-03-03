# State: Oisin UI

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-02)

**Core value:** Work on your code from anywhere with your OpenCode instance and settings, reliably.
**Current focus:** v3 TABS COOLERS — multi-tab terminals, chat overlay, voice input, git push.

## Current Position

**Milestone:** v3 TABS COOLERS
**Phase:** 13 - Multi-Tab (pending)
**Plan:** 12-02 complete (2/2)
**Status:** Phase 12 complete, ready for phase 13 planning
**Last activity:** 2026-03-03 — Completed 12-02-PLAN.md

```
v3 Progress: [████░░░░░░░░░░░░░░░░] 20%
Phase 12:    [████████████████████] 100% (2/2 plans)
```

## Performance Metrics

| Milestone | Phases | Plans | Days | Commits |
|-----------|--------|-------|------|---------|
| v1 MVP | 5 | 34 | 4 | ~85 |
| v1.1 Hardening | 3 | 12 | 3 | 72 |
| v2 Code Review | 3 | 18 | 2 | ~45 |
| v3 TABS COOLERS | 5 | TBD | TBD | TBD |

## Accumulated Context

### Completed Milestones

- v1 MVP (phases 01-05) shipped 2026-02-25 — 34 plans
- v1.1 Hardening (phases 06-08) shipped 2026-02-28 — 12 plans
- v2 Code Review (phases 09-11) shipped 2026-03-02 — 18 plans

### v3 Phase Structure

| Phase | Goal | Requirements | Dependencies |
|-------|------|--------------|--------------|
| 12. Git Push | Push to remote from browser | PUSH-01..03 | Phase 11 |
| 13. Multi-Tab | N terminal tabs per thread | TABS-01..06 | Phase 12 |
| 14. Background Agents | Monitor agents across projects | AGENT-01..03 | Phase 13 |
| 15. AI Chat Overlay | Chat UI over terminal output | CHAT-01..07 | Phase 13 |
| 16. Voice Input | Push-to-talk transcription | VOICE-01..03 | Phase 15 |

### Research Findings (Summary)

- Git push backend already exists — `checkout_push_request` handler in session.ts
- Multi-tab uses existing binary mux with multiple streamIds
- Chat overlay parses existing `AgentTimelineItem` from `agent_stream`
- Voice uses existing `DictationStreamManager` + `SpeechToTextProvider`
- Critical: xterm.js memory leaks on tab close — must dispose addons first

### Decisions Made

| Decision | Rationale |
|----------|-----------|
| Git Push first | Backend exists, quick win, 1-2 days |
| Multi-Tab before Chat | Foundation needed for AI tabs |
| Voice last | Independent, can defer if needed |
| Push button always visible, disabled when not pushable | Stable UI affordance with clear state |
| Reuse diff-store listener pattern for push/status wiring | Keeps websocket behavior consistent with commit/stage |
| Represent first-push explicitly with hasUpstream | Prevents null ahead count from disabling valid first push |

### Open Questions

1. Tab limit per thread? (Research suggests 5)
2. Chat persistence strategy? (Regenerate from terminal vs persist)
3. Force push policy? (Block on protected, confirm otherwise)

## Session Continuity

**Last session:** 2026-03-03 03:05 UTC
**Stopped at:** Completed 12-02-PLAN.md
**Resume file:** None

## Todos

- [ ] `/gsd-plan-phase 13` — plan Multi-Tab phase
- [ ] Capture OpenCode output samples for chat parser development

## Blockers

None.

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Add oxlint/oxfmt/shadcn-enforcer/AGENTS.md to web package | 2026-02-28 | 4726a8d | [001-add-oxlint-oxfmt-shadcn-enforcer-plugin](./quick/001-add-oxlint-oxfmt-shadcn-enforcer-plugin/) |
| 002 | Refactor app sidebar to use pure ShadCN structure | 2026-03-02 | 73362d7 | [002-refactor-app-sidebar-to-use-pure-shadcn-stru](./quick/002-refactor-app-sidebar-to-use-pure-shadcn-stru/) |
| 003 | Fix pure ShadCN sidebar layout | 2026-03-02 | 066e5e0 | [003-fix-pure-shadcn-sidebar-layout](./quick/003-fix-pure-shadcn-sidebar-layout/) |
| 004 | Fix v2 tech debt: runtime-only sessionKey test + stage/unstage toast feedback | 2026-03-02 | 500fffd | [004-fix-v2-tech-debt](./quick/004-fix-v2-tech-debt/) |

---

_State updated: 2026-03-03 — completed phase 12 plan 02._
