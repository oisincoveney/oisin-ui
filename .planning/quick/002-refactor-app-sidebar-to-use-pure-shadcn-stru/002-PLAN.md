---
phase: quick
plan: 002
type: execute
wave: 1
depends_on: []
files_modified: ["packages/web/src/components/app-sidebar.tsx"]
autonomous: true
must_haves:
  truths:
    - "App sidebar projects are collapsible using standard ShadCN structure"
    - "Thread items use standard SidebarMenuAction for delete buttons"
    - "Hover states and active states work correctly without custom div wrappers"
  artifacts:
    - path: "packages/web/src/components/app-sidebar.tsx"
      provides: "App sidebar component"
  key_links: []
---

<objective>
Refactor app sidebar to use pure ShadCN structure

Purpose: Remove custom div wrappers and styling in the sidebar that break ShadCN's built-in peering (`group/menu-item`, `peer/menu-button`) and structural expectations.
Output: A cleaner `app-sidebar.tsx` that leverages `SidebarMenuAction`, `SidebarMenuBadge`, and proper `SidebarMenuButton` structure.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/components/app-sidebar.tsx
@packages/web/src/components/ui/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor Sidebar Project and Thread Item Structure</name>
  <files>packages/web/src/components/app-sidebar.tsx</files>
  <action>
    Refactor `AppSidebar` to strictly use ShadCN UI sidebar components without custom nesting wrappers:
    1. Import `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSub` (if appropriate, or keep nested `SidebarMenu` but remove intermediate `div` wrappers).
    2. For the Project collapsible: Use `SidebarMenuItem` containing `Collapsible`. Set `CollapsibleTrigger` to use `render={<SidebarMenuButton />}` instead of custom classes, and align the chevron logic with ShadCN patterns.
    3. For Thread items: Remove the `<div className="group flex items-start gap-1">` wrapper around the thread button and delete action.
    4. Make the Thread button a direct child of `SidebarMenuItem` (as `SidebarMenuButton`).
    5. Replace the custom Delete button implementation with `SidebarMenuAction` (which expects to be a sibling of `SidebarMenuButton` inside `SidebarMenuItem`), using `showOnHover`. Note that `TooltipTrigger` supports `render={<SidebarMenuAction />}`.
    6. Ensure the unread indicator or other badges use `SidebarMenuBadge` if applicable, or integrate them cleanly into the `SidebarMenuButton` content.
    7. Ensure `SidebarMenuButton` uses `render={<button ... />}` or standard onClick without breaking peering.
  </action>
  <verify>npx oxlint packages/web/src/components/app-sidebar.tsx && npx tsc -p packages/web/tsconfig.json --noEmit</verify>
  <done>Sidebar renders using pure ShadCN structural components and peering classes, with hover actions working correctly.</done>
</task>

</tasks>

<verification>
- No arbitrary `div` wrappers inside `SidebarMenuItem` that break CSS peering.
- Delete buttons correctly use `SidebarMenuAction`.
- Collapsible projects correctly use `SidebarMenuButton` inside `CollapsibleTrigger`.
</verification>

<success_criteria>
- TypeScript compiles successfully.
- Code is cleaner and leverages ShadCN primitives as designed.
</success_criteria>

<output>
After completion, create `.planning/quick/002-refactor-app-sidebar-to-use-pure-shadcn-stru/002-SUMMARY.md`
</output>
