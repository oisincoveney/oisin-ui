# Agent Rules

## No Raw HTML in JSX

**Rule:** Do not use raw HTML elements in JSX. All interactive UI must use ShadCN components.

**Exception:** `<form>` is explicitly allowed.

### Available ShadCN Components

| Component | Import Path |
|-----------|-------------|
| AlertDialog | `@/components/ui/alert-dialog` |
| Button | `@/components/ui/button` |
| Collapsible | `@/components/ui/collapsible` |
| Dialog | `@/components/ui/dialog` |
| Input | `@/components/ui/input` |
| Label | `@/components/ui/label` |
| Resizable | `@/components/ui/resizable` |
| ScrollArea | `@/components/ui/scroll-area` |
| Separator | `@/components/ui/separator` |
| Sheet | `@/components/ui/sheet` |
| Sidebar | `@/components/ui/sidebar` |
| Skeleton | `@/components/ui/skeleton` |
| Sonner | `@/components/ui/sonner` |
| Tooltip | `@/components/ui/tooltip` |

### Enforcement

The `shadcn-enforcer` opencode plugin (`.opencode/plugins/shadcn-enforcer.ts`) mechanically
intercepts `write`, `edit`, `multiedit`, and `patch` tool calls. Any attempt to write a raw
lowercase HTML tag (except `<form>`) to a `.tsx` or `.jsx` file outside `components/ui/`
will be blocked with an error listing the violations and available ShadCN alternatives.
