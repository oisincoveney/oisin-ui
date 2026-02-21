# Phase 01 Plan 01: Project Bootstrap & Codebase Cleanup

## Metadata

phase: 01-foundation-and-docker

plan: 01

subsystem: monorepo-bootstrap

tags: [bootstrap, cleanup, workspaces]

## Decisions Made

- Keep only `packages/server` and `packages/cli` in the initial workspace to simplify the conversion to a web-first architecture.
- Preserve root tooling scripts only where they target remaining packages.
- Replace the top-level README with a concise Oisin UI identity before future web-client scaffolding is added.

## Dependency Graph

requires:
- Phase 01 roadmap and baseline repo copy (`01-01-PLAN.md`, `01-FOUNDATION...`).

provides:
- Clean root workspace limited to `@getpaseo/server` and `@getpaseo/cli`.

affects:
- All subsequent Phase 01 plans (02-05) now operate on the trimmed monorepo baseline.

## Tech Tracking

tech-stack:
  added: []
  patterns:
  - workspace pruning during baseline conversion
  - explicit package list in npm `workspaces`

## Files

key-files:
  created:
  - `.planning/phases/01-foundation-and-docker/01-01-SUMMARY.md`
  modified:
  - `README.md`
  - `package.json`
  - `package-lock.json`
  - `packages/app/*` (deleted)
  - `packages/desktop/*` (deleted)
  - `packages/relay/*` (deleted)
  - `packages/website/*` (deleted)
  - `docs/daemon-session-connection-architecture-review.md` (deleted)
  - `docs/daemon-session-connection-architecture-spec.md` (deleted)

## Execution Summary

- Completed the remaining bootstrap actions for `01-01`: copied base into place in prior step, then removed all unused package workspaces and updated `workspaces` and scripts.
- Deleted legacy non-core workspaces (`app`, `desktop`, `website`, `relay`) from disk and lockfile workspace references where appropriate.
- Removed stale `docs/` architectural notes and rewrote `README.md` for Oisin UI identity.
- Verified installation (`npm install`) succeeds after trimming to two package workspaces.

## Deviations from Plan

None - plan executed exactly as written.

## Metrics

duration: 00:05:12

completed: 2026-02-21

## Verification

- Ran `npm install` with success.
- Confirmed `packages/` now contains `server` and `cli` only.
- Confirmed root `package.json` contains `packages/server` and `packages/cli` only.
- Confirmed `README.md` now says: `Oisin UI is a self-hosted web terminal for AI coding agents.`

## Next Phase Readiness

- Phase is ready to continue into `01-02` with a server/cli-only baseline and fresh web client scaffolding context.
