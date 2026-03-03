# Phase 09 UAT Gap 3 - Not a git repository

- Symptom: diff panel error "Not a git repository: /config/worktrees/...".
- Cause: stale/invalid thread worktreePath used as diff cwd without server-side validation/recovery.
- Impact: no staged/unstaged lists, blocks rename validation.
