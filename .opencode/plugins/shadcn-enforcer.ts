import * as fs from "fs"
import * as path from "path"

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

function isJsxFile(filePath: string): boolean {
  return filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
}

function isShadcnUiFile(filePath: string): boolean {
  return filePath.includes("components/ui/")
}

function getShadcnComponentList(directory: string): string {
  const uiDir = path.join(directory, "packages/web/src/components/ui")
  try {
    return fs
      .readdirSync(uiDir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => {
        const slug = f.replace(/\.tsx$/, "")
        const name = slug
          .split("-")
          .map((p) => p[0].toUpperCase() + p.slice(1))
          .join("")
        return `  - ${name}: import from '@/components/ui/${slug}'`
      })
      .join("\n")
  } catch {
    return "  (could not read components/ui directory)"
  }
}

export const ShadcnEnforcerPlugin = async ({ directory }: { directory: string }) => {
  const componentList = getShadcnComponentList(directory)

  return {
    "tool.execute.before": async (
      input: { tool?: string },
      output: { args?: Record<string, unknown> },
    ) => {
      const tool = input.tool
      if (!tool || !["write", "edit", "multiedit"].includes(tool)) return

      const args = output.args ?? {}

      const filePath = (args.filePath ?? "") as string
      if (!isJsxFile(filePath) || isShadcnUiFile(filePath)) return

      let contentToCheck = ""

      if (tool === "write") {
        contentToCheck = (args.content as string) ?? ""
      } else if (tool === "edit") {
        contentToCheck = (args.newString as string) ?? ""
      } else if (tool === "multiedit") {
        const edits =
          (args.edits as Array<{ filePath: string; oldString: string; newString: string; replaceAll?: boolean }>) ?? []
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
          componentList,
        ].join("\n"),
      )
    },
  }
}
