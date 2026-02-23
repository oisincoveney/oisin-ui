import { html as renderDiffHtml } from 'diff2html'
import type { ParsedDiffFile, ParsedDiffHunk, ParsedDiffLine } from './diff-types'

const DEFAULT_CONTEXT_LINES = 3

export const DEFAULT_VISIBLE_HUNK_COUNT = 6

type Diff2HtmlLine = {
  content: string
  type: 'insert' | 'delete' | 'context'
  oldNumber?: number
  newNumber?: number
}

type Diff2HtmlBlock = {
  header: string
  oldStartLine: number
  oldStartLine2?: number
  newStartLine: number
  lines: Diff2HtmlLine[]
}

type Diff2HtmlFile = {
  isGitDiff: boolean
  oldName: string
  newName: string
  language: string
  isCombined: boolean
  addedLines: number
  deletedLines: number
  isDeleted: boolean
  isNew: boolean
  blocks: Diff2HtmlBlock[]
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  cjs: 'javascript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  mts: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  php: 'php',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  xml: 'xml',
  vue: 'xml',
  svelte: 'xml',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini',
  dockerfile: 'dockerfile',
}

function getLanguageFromPath(path: string): string {
  const fileName = path.split('/').pop()?.toLowerCase() ?? ''
  if (!fileName) {
    return 'plaintext'
  }

  if (fileName === 'dockerfile') {
    return 'dockerfile'
  }

  const extension = fileName.split('.').pop()
  if (!extension || extension === fileName) {
    return 'plaintext'
  }

  return EXTENSION_LANGUAGE_MAP[extension] ?? 'plaintext'
}

function normalizeLineContent(line: ParsedDiffLine): string {
  if (line.tokens && line.tokens.length > 0) {
    return line.tokens.map((token) => token.text).join('')
  }
  return line.content
}

function trimHunkContext(hunk: ParsedDiffHunk, contextLines: number): ParsedDiffHunk {
  const headerLines = hunk.lines.filter((line) => line.type === 'header')
  const bodyLines = hunk.lines.filter((line) => line.type !== 'header')

  if (bodyLines.length === 0) {
    return hunk
  }

  const firstChangedLine = bodyLines.findIndex((line) => line.type === 'add' || line.type === 'remove')
  if (firstChangedLine < 0) {
    return {
      ...hunk,
      lines: [...headerLines, ...bodyLines.slice(0, Math.max(1, contextLines * 2))],
    }
  }

  let lastChangedLine = firstChangedLine
  for (let i = bodyLines.length - 1; i >= 0; i -= 1) {
    if (bodyLines[i]?.type === 'add' || bodyLines[i]?.type === 'remove') {
      lastChangedLine = i
      break
    }
  }

  const start = Math.max(0, firstChangedLine - contextLines)
  const end = Math.min(bodyLines.length, lastChangedLine + contextLines + 1)

  return {
    ...hunk,
    lines: [...headerLines, ...bodyLines.slice(start, end)],
  }
}

function toDiff2HtmlBlock(hunk: ParsedDiffHunk): Diff2HtmlBlock {
  let oldLineNumber = hunk.oldStart
  let newLineNumber = hunk.newStart

  const lines: Diff2HtmlLine[] = []

  for (const line of hunk.lines) {
    if (line.type === 'header') {
      continue
    }

    const content = normalizeLineContent(line)

    if (line.type === 'add') {
      lines.push({
        type: 'insert',
        content: `+${content}`,
        newNumber: newLineNumber,
      })
      newLineNumber += 1
      continue
    }

    if (line.type === 'remove') {
      lines.push({
        type: 'delete',
        content: `-${content}`,
        oldNumber: oldLineNumber,
      })
      oldLineNumber += 1
      continue
    }

    lines.push({
      type: 'context',
      content: ` ${content}`,
      oldNumber: oldLineNumber,
      newNumber: newLineNumber,
    })
    oldLineNumber += 1
    newLineNumber += 1
  }

  return {
    header: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
    oldStartLine: hunk.oldStart,
    oldStartLine2: hunk.oldCount,
    newStartLine: hunk.newStart,
    lines,
  }
}

function getRenameFromPath(path: string): { oldPath: string; newPath: string } | null {
  const arrowToken = ' -> '
  const arrowIndex = path.indexOf(arrowToken)
  if (arrowIndex < 0) {
    return null
  }
  const oldPath = path.slice(0, arrowIndex)
  const newPath = path.slice(arrowIndex + arrowToken.length)
  if (!oldPath || !newPath) {
    return null
  }
  return { oldPath, newPath }
}

function getRenamePaths(file: ParsedDiffFile): { oldPath: string; newPath: string } {
  const maybeOldPath = file.oldPath
  if (typeof maybeOldPath === 'string' && maybeOldPath.length > 0 && maybeOldPath !== file.path) {
    return {
      oldPath: maybeOldPath,
      newPath: file.path,
    }
  }

  const parsed = getRenameFromPath(file.path)
  if (parsed) {
    return parsed
  }

  return {
    oldPath: file.path,
    newPath: file.path,
  }
}

export function getDiffFileDisplayPath(file: ParsedDiffFile): string {
  const { oldPath, newPath } = getRenamePaths(file)
  if (oldPath === newPath) {
    return newPath
  }
  return `${oldPath} -> ${newPath}`
}

export function toDiff2Html(file: ParsedDiffFile, options?: { contextLines?: number; hunkLimit?: number }): string {
  const { oldPath, newPath } = getRenamePaths(file)
  const language = getLanguageFromPath(newPath)
  const contextLines = options?.contextLines ?? DEFAULT_CONTEXT_LINES
  const rawHunks = typeof options?.hunkLimit === 'number' ? file.hunks.slice(0, options.hunkLimit) : file.hunks
  const hunks = rawHunks.map((hunk) => trimHunkContext(hunk, contextLines))

  const diffFile: Diff2HtmlFile = {
    isGitDiff: true,
    oldName: oldPath,
    newName: newPath,
    language,
    isCombined: false,
    addedLines: file.additions,
    deletedLines: file.deletions,
    isDeleted: file.isDeleted,
    isNew: file.isNew,
    blocks: hunks.map(toDiff2HtmlBlock),
  }

  return renderDiffHtml([diffFile] as any, {
    drawFileList: false,
    matching: 'none',
    outputFormat: 'side-by-side',
    renderNothingWhenEmpty: true,
  })
}
