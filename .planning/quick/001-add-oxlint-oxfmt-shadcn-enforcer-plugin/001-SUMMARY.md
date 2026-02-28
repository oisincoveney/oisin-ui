# Quick Task 001 Summary

**Description:** Add oxlint, oxfmt, shadcn-enforcer plugin, and AGENTS.md to web package

## Commits

- `4f2e2e2`: `chore(quick-001): add oxlint + oxfmt tooling to packages/web`
- `4726a8d`: `feat(quick-001): add shadcn-enforcer plugin, web-fix hook, and AGENTS.md`

## Changes

### Task 1: Web tooling
- `packages/web/package.json` — removed `typescript`, added `oxfmt` + `oxlint-tsgolint`, updated scripts
- `packages/web/.oxlintrc.json` — new oxlint config (react, typescript, jsx-a11y, vitest, import plugins)
- `packages/web/.oxfmtrc.json` — new oxfmt formatter config (120 printWidth, single quotes, no semi)

### Task 2: Hooks + plugin + docs
- `lefthook.yml` — added `web-fix` pre-commit command
- `.opencode/plugins/shadcn-enforcer.ts` — blocks raw HTML tags in JSX via tool.execute.before
- `AGENTS.md` — documents the no-raw-HTML rule and lists all 14 ShadCN components
