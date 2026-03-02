---
phase: quick
plan: "003"
subsystem: ui/sidebar
tags: [shadcn, refactor, sidebar, layout]
tech-stack:
  patterns: [shadcn-composition]
key-files:
  modified:
    - packages/web/src/components/app-sidebar.tsx
metrics:
  completed: 2026-03-02
---

# Quick Task 003: Fix Pure ShadCN Sidebar Layout

**One-liner:** Replace raw HTML elements with ShadCN sidebar primitives in app-sidebar.tsx

## What Changed

Refactored `app-sidebar.tsx` to use pure ShadCN structure:
- Replaced raw `<div>` elements with `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`
- Replaced raw `<button>` elements with ShadCN `Button` component
- Replaced raw `<a>` elements with proper Link + SidebarMenuButton composition
- Maintained existing layout and functionality while conforming to AGENTS.md rules

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 066e5e0 | refactor(quick-003): replace raw html with shadcn structure in sidebar | app-sidebar.tsx (+86/-74) |

## Deviations from Plan

None — executed as requested.

## Verification

- Component renders correctly
- All raw HTML replaced with ShadCN equivalents
- AGENTS.md shadcn-enforcer rules satisfied
