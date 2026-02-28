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
      if (!tool || !["write", "edit", "multiedit"].includes(tool)) return

      const args = output.args ?? {}

      // Determine file path
      const filePath = (args.filePath ?? "") as string
      if (!isJsxFile(filePath) || isShadcnUiFile(filePath)) return

      // Extract content to check based on tool type
      let contentToCheck = ""

      if (tool === "write") {
        contentToCheck = (args.content as string) ?? ""
      } else if (tool === "edit") {
        contentToCheck = (args.newString as string) ?? ""
      } else if (tool === "multiedit") {
        const edits = (args.edits as Array<{ filePath: string; oldString: string; newString: string; replaceAll?: boolean }>) ?? []
        contentToCheck = edits.map((e) => e.newString ?? "").join("\n")
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
