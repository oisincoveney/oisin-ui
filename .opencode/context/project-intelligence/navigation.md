<!-- Context: project-intelligence/nav | Priority: critical | Version: 1.0 | Updated: 2026-02-21 -->

# Project Intelligence — Paseo

> Start here for quick project understanding.

## Structure

```
.opencode/context/project-intelligence/
├── navigation.md          # This file — quick overview
└── technical-domain.md    # Stack, architecture, code patterns
```

## Quick Routes

| What You Need         | File                  | Description                                                           |
| --------------------- | --------------------- | --------------------------------------------------------------------- |
| Tech stack & patterns | `technical-domain.md` | Monorepo structure, stack, code patterns, naming, standards, security |

## Usage

**New developer / agent**:

1. Read `technical-domain.md` for full technical context
2. Check `AGENTS.md` (repo root) for runtime/debugging guidance

**Quick reference**:

- Component patterns → `technical-domain.md` § Code Patterns
- Naming conventions → `technical-domain.md` § Naming Conventions
- Security rules → `technical-domain.md` § Security Requirements

## Maintenance

Update `technical-domain.md` when:

- Adding/upgrading a major dependency
- Changing code patterns or conventions
- Making architectural decisions

Run `/add-context --update` to step through changes interactively.
