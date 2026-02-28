---
phase: quick-001
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/package.json
  - packages/web/.oxlintrc.json
  - packages/web/.oxfmtrc.json
  - lefthook.yml
  - .opencode/plugins/shadcn-enforcer.ts
  - AGENTS.md
autonomous: true

must_haves:
  truths:
    - "packages/web lints via oxlint --type-aware"
    - "packages/web formats via oxfmt"
    - "pre-commit hook runs web-fix on staged web src files"
    - "shadcn-enforcer plugin blocks raw HTML tags in JSX writes"
    - "AGENTS.md documents the no-raw-HTML rule"
  artifacts:
    - path: "packages/web/.oxlintrc.json"
      provides: "oxlint config with react/ts/a11y plugins"
    - path: "packages/web/.oxfmtrc.json"
      provides: "oxfmt formatter config"
    - path: ".opencode/plugins/shadcn-enforcer.ts"
      provides: "tool.execute.before plugin blocking raw HTML in JSX"
    - path: "AGENTS.md"
      provides: "agent rule: use ShadCN, no raw HTML"
  key_links:
    - from: "lefthook.yml"
      to: "packages/web scripts"
      via: "bun run fix"
      pattern: "bun run fix"
---

<objective>
Add oxlint + oxfmt tooling to packages/web, wire pre-commit hook, add shadcn-enforcer opencode plugin, and document the no-raw-HTML rule in AGENTS.md.

Purpose: Enforce consistent formatting/linting and prevent raw HTML in JSX across the codebase.
Output: Updated package.json, two new config files, updated lefthook.yml, new plugin, new AGENTS.md.
</objective>

<execution_context>
@~/.config/Claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@packages/web/package.json
@lefthook.yml
@.opencode/plugins/docker-only-guard.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update packages/web tooling (package.json + config files)</name>
  <files>
    packages/web/package.json
    packages/web/.oxlintrc.json
    packages/web/.oxfmtrc.json
  </files>
  <action>
    **packages/web/package.json:**
    - Remove `"typescript": "~5.9.3"` from devDependencies
    - Add `"oxfmt": "latest"` and `"oxlint-tsgolint": "latest"` to devDependencies
    - Replace scripts entirely with:
      ```json
      "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview",
        "lint": "oxlint --type-aware",
        "lint:fix": "bun run lint --fix --fix-suggestions",
        "fmt": "oxfmt",
        "typecheck": "oxlint --type-aware --type-check",
        "fix": "bun run fmt && bun run lint:fix"
      }
      ```

    **packages/web/.oxlintrc.json** — create new file with exact content:
    ```json
    {
      "$schema": "./node_modules/oxlint/configuration_schema.json",
      "plugins": ["react", "typescript", "jsx-a11y", "vitest", "import"],
      "env": { "browser": true },
      "globals": { "exports": "readonly" },
      "ignorePatterns": [
        "src/index.css",
        "src/components/ui/**"
      ],
      "rules": {
        "import/no-barrel-file": "warn",
        "eslint/curly": "error",
        "eslint/default-case-last": "error",
        "eslint/eqeqeq": "error",
        "eslint/no-case-declarations": "error",
        "eslint/no-console": ["error", { "allow": ["error"] }],
        "eslint/no-empty": "error",
        "eslint/no-fallthrough": "error",
        "eslint/no-labels": "error",
        "eslint/no-lone-blocks": "error",
        "eslint/no-new-wrappers": "error",
        "eslint/no-prototype-builtins": "error",
        "eslint/no-redeclare": "error",
        "eslint/no-regex-spaces": "error",
        "eslint/no-self-compare": "error",
        "eslint/no-unneeded-ternary": "error",
        "eslint/no-use-before-define": "off",
        "eslint/no-var": "warn",
        "eslint/no-void": "error",
        "eslint/no-throw-literal": "error",
        "eslint/one-var": ["error", "never"],
        "eslint/prefer-const": "error",
        "eslint/prefer-regex-literals": "error",
        "eslint/yoda": "error",
        "eslint/no-useless-constructor": "error"
      },
      "overrides": [
        {
          "files": ["**/*.ts", "**/*.tsx"],
          "rules": { "typescript/no-explicit-any": "error" }
        },
        {
          "files": ["**/*.jsx", "**/*.tsx"],
          "rules": {
            "react/jsx-boolean-value": "error",
            "react/jsx-fragments": "error",
            "react/jsx-key": "error",
            "react/jsx-no-comment-textnodes": "error",
            "react/jsx-no-duplicate-props": "error",
            "react/jsx-no-target-blank": "error",
            "react/no-children-prop": "error",
            "react/no-danger-with-children": "error"
          }
        },
        {
          "files": ["**/*.test.ts"],
          "rules": {
            "eslint/no-restricted-imports": ["error", {
              "paths": [{ "name": "@/test/browser", "message": "Browser test utilities cannot be imported in .test.ts files. Use .test.tsx for component tests." }]
            }]
          }
        },
        {
          "files": ["**/*.test.tsx"],
          "rules": {
            "eslint/no-restricted-imports": ["error", {
              "paths": [{ "name": "@/test/node", "message": "Node test utilities cannot be imported in .test.tsx files. Use .test.ts for non-component tests." }]
            }]
          }
        }
      ]
    }
    ```

    **packages/web/.oxfmtrc.json** — create new file:
    ```json
    {
      "$schema": "./node_modules/oxfmt/configuration_schema.json",
      "useTabs": false,
      "tabWidth": 2,
      "printWidth": 120,
      "singleQuote": true,
      "jsxSingleQuote": false,
      "quoteProps": "as-needed",
      "trailingComma": "all",
      "semi": false,
      "arrowParens": "always",
      "bracketSameLine": false,
      "bracketSpacing": true,
      "ignorePatterns": ["src/index.css"]
    }
    ```
  </action>
  <verify>
    - `cat packages/web/package.json` — confirm no `typescript` dep, no `tsc -b`, all 9 scripts present
    - `cat packages/web/.oxlintrc.json` — confirm file exists with plugins array
    - `cat packages/web/.oxfmtrc.json` — confirm file exists with singleQuote: true
  </verify>
  <done>package.json has updated scripts and deps; both config files exist with correct content</done>
</task>

<task type="auto">
  <name>Task 2: Update lefthook.yml + create shadcn-enforcer plugin + create AGENTS.md</name>
  <files>
    lefthook.yml
    .opencode/plugins/shadcn-enforcer.ts
    AGENTS.md
  </files>
  <action>
    **lefthook.yml** — append `web-fix` command inside the existing `pre-commit.commands` block:
    ```yaml
        web-fix:
          glob: "packages/web/src/**/*.{ts,tsx,js}"
          run: cd packages/web && bun run fix
    ```
    Result should be three commands under pre-commit.commands: bun-lock-guard, block-npm-lock, web-fix.

    **.opencode/plugins/shadcn-enforcer.ts** — create new file:
    ```typescript
    const SHADCN_COMPONENTS = [
      { name: "AlertDialog", path: "@/components/ui/alert-dialog" },
      { name: "Button", path: "@/components/ui/button" },
      { name: "Collapsible", path: "@/components/ui/collapsible" },
      { name: "Dialog", path: "@/components/ui/dialog" },
      { name: "Input", path: "@/components/ui/input" },
      { name: "Label", path: "@/components/ui/label" },
      { name: "Resizable", path: "@/components/ui/resizable" },
      { name: "ScrollArea", path: "@/components/ui/scroll-area" },
      { name: "Separator", path: "@/components/ui/separator" },
      { name: "Sheet", path: "@/components/ui/sheet" },
      { name: "Sidebar", path: "@/components/ui/sidebar" },
      { name: "Skeleton", path: "@/components/ui/skeleton" },
      { name: "Sonner", path: "@/components/ui/sonner" },
      { name: "Tooltip", path: "@/components/ui/tooltip" },
    ]

    const SHADCN_COMPONENT_LIST = SHADCN_COMPONENTS.map(
      (c) => `  - ${c.name}: import from '${c.path}'`,
    ).join("\n")

    // Matches lowercase JSX tags except <form
    const LOWERCASE_JSX_TAG = /<(?!form\b)[a-z][a-z0-9-]*[\s>/]/g
    // Matches React.createElement with string (lowercase) tag
    const CREATE_ELEMENT_STRING_TAG = /React\.createElement\(\s*['"][a-z]/g

    function getViolations(content: string): Array<{ tag: string; line: number }> {
      const violations: Array<{ tag: string; line: number }> = []
      const lines = content.split("\n")

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineNum = i + 1

        for (const match of line.matchAll(LOWERCASE_JSX_TAG)) {
          // Extract tag name from match (strip leading < and trailing char)
          const tag = match[0].slice(1).replace(/[\s>/].*/, "")
          violations.push({ tag: `<${tag}>`, line: lineNum })
        }

        for (const match of line.matchAll(CREATE_ELEMENT_STRING_TAG)) {
          const raw = match[0]
          const tagMatch = raw.match(/['"]([a-z][a-z0-9-]*)['"]/)
          const tag = tagMatch ? tagMatch[1] : "unknown"
          violations.push({ tag: `React.createElement('${tag}')`, line: lineNum })
        }
      }

      return violations
    }

    function isJsxFile(path: string): boolean {
      return path.endsWith(".tsx") || path.endsWith(".jsx")
    }

    function isShadcnUiFile(path: string): boolean {
      return path.includes("components/ui/")
    }

    export const ShadcnEnforcerPlugin = async () => {
      return {
        "tool.execute.before": async (
          input: { tool?: string },
          output: { args?: Record<string, unknown> },
        ) => {
          const tool = input.tool
          if (!tool || !["write", "edit", "multiedit", "patch"].includes(tool)) return

          const args = output.args ?? {}

          // Determine file path
          const filePath = (args.path ?? args.file ?? args.filename ?? "") as string
          if (!isJsxFile(filePath) || isShadcnUiFile(filePath)) return

          // Extract content to check based on tool type
          let contentToCheck = ""

          if (tool === "write") {
            contentToCheck = (args.content as string) ?? ""
          } else if (tool === "edit" || tool === "multiedit") {
            contentToCheck = (args.newString as string) ?? ""
          } else if (tool === "patch") {
            // Only check added lines (lines starting with +)
            const patch = (args.patch as string) ?? ""
            contentToCheck = patch
              .split("\n")
              .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
              .map((l) => l.slice(1))
              .join("\n")
          }

          if (!contentToCheck) return

          const violations = getViolations(contentToCheck)
          if (violations.length === 0) return

          const violationList = violations.map((v) => `  - ${v.tag} (line ${v.line})`).join("\n")

          throw new Error(
            [
              "ShadCN Enforcer: Raw HTML elements are not allowed in JSX files.",
              "Use ShadCN components instead. Exception: <form> is allowed.",
              "",
              "Violations found:",
              violationList,
              "",
              "Available ShadCN components:",
              SHADCN_COMPONENT_LIST,
            ].join("\n"),
          )
        },
      }
    }
    ```

    **AGENTS.md** — create new file at repo root:
    ```markdown
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
    ```
  </action>
  <verify>
    - `cat lefthook.yml` — confirm web-fix command present under pre-commit.commands
    - `cat .opencode/plugins/shadcn-enforcer.ts` — confirm file exists, exports ShadchnEnforcerPlugin
    - `cat AGENTS.md` — confirm file exists with component table
  </verify>
  <done>lefthook has web-fix hook; shadcn-enforcer plugin exists and exports correctly; AGENTS.md documents the rule with all 14 components</done>
</task>

</tasks>

<verification>
- `cat packages/web/package.json | grep -E '"build"|"lint"|"fmt"|"typecheck"|"fix"|"typescript"'` — build=vite build, lint=oxlint --type-aware, no typescript dep
- `ls packages/web/.oxlintrc.json packages/web/.oxfmtrc.json` — both exist
- `grep "web-fix" lefthook.yml` — hook present
- `ls .opencode/plugins/shadcn-enforcer.ts AGENTS.md` — both exist
</verification>

<success_criteria>
- packages/web/package.json: no typescript dep, no tsc -b, all 9 scripts correct
- packages/web/.oxlintrc.json exists with correct plugin list and rules
- packages/web/.oxfmtrc.json exists with correct formatter settings
- lefthook.yml has web-fix under pre-commit.commands
- .opencode/plugins/shadcn-enforcer.ts exists, intercepts write/edit/multiedit/patch, blocks lowercase HTML (except form) in .tsx/.jsx outside components/ui/
- AGENTS.md exists at repo root with rule, exception, and all 14 ShadCN components
</success_criteria>

<output>
No SUMMARY.md needed for quick tasks.
</output>
