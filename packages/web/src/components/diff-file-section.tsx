import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileCode2 } from 'lucide-react'
import type { ParsedDiffFile } from '@/diff/diff-types'
import { DEFAULT_VISIBLE_HUNK_COUNT, getDiffFileDisplayPath, toDiff2Html } from '@/diff/diff2html-adapter'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type DiffFileSectionProps = {
  file: ParsedDiffFile
}

function formatFileStatus(file: ParsedDiffFile): string | null {
  if (file.status === 'binary') {
    return 'binary'
  }
  if (file.status === 'too_large') {
    return 'large'
  }
  return null
}

function isSummaryOnly(file: ParsedDiffFile): boolean {
  return file.status === 'binary' || file.status === 'too_large'
}

export function DiffFileSection({ file }: DiffFileSectionProps) {
  const [open, setOpen] = useState(false)
  const [showAllHunks, setShowAllHunks] = useState(false)
  const [html, setHtml] = useState<string | null>(null)

  const summaryOnly = isSummaryOnly(file)
  const statusLabel = formatFileStatus(file)
  const visibleHunkCount = showAllHunks ? file.hunks.length : Math.min(file.hunks.length, DEFAULT_VISIBLE_HUNK_COUNT)
  const hiddenHunkCount = Math.max(0, file.hunks.length - visibleHunkCount)
  const displayPath = useMemo(() => getDiffFileDisplayPath(file), [file])

  useEffect(() => {
    if (!open || summaryOnly) {
      return
    }
    setHtml(
      toDiff2Html(file, {
        hunkLimit: visibleHunkCount,
      }),
    )
  }, [file, open, summaryOnly, visibleHunkCount])

  useEffect(() => {
    setHtml(null)
    setShowAllHunks(false)
    setOpen(false)
  }, [file.path, file.oldPath])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <article
        data-testid="diff-file-section"
        className="overflow-hidden rounded-md border border-border/70 bg-background/70"
      >
        <CollapsibleTrigger
          data-testid="diff-file-row"
          className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/35"
        >
          <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger data-testid="diff-file-path" className="truncate text-sm font-medium text-foreground">
                  {displayPath}
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs break-all text-xs">
                  {getDiffFileDisplayPath(file)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <p className="text-xs text-muted-foreground">
              <span data-testid="diff-file-additions" className="text-emerald-500">
                +{file.additions}
              </span>
              <span className="mx-2 text-border">/</span>
              <span data-testid="diff-file-deletions" className="text-rose-500">
                -{file.deletions}
              </span>
              {statusLabel ? <span className="ml-2 uppercase tracking-wide">{statusLabel}</span> : null}
              {file.isNew ? (
                <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-emerald-400">new</span>
              ) : null}
              {file.isDeleted ? (
                <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-rose-400">del</span>
              ) : null}
            </p>
          </div>
          <ChevronDown
            className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </CollapsibleTrigger>

        <CollapsibleContent data-testid="diff-file-content" className="border-t border-border/60 bg-card/40">
          {summaryOnly ? (
            <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="diff-file-summary">
              {file.status === 'binary'
                ? 'Binary file. Diff preview unavailable.'
                : 'File exceeds diff preview limit. Review full patch in terminal.'}
            </p>
          ) : (
            <div className="space-y-2 px-3 py-2">
              {html ? <div className="diff2html-wrapper" dangerouslySetInnerHTML={{ __html: html }} /> : null}
              {hiddenHunkCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="diff-file-expand-hunks"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setShowAllHunks(true)
                  }}
                >
                  Show {hiddenHunkCount} more hunks
                </Button>
              ) : null}
            </div>
          )}
        </CollapsibleContent>
      </article>
    </Collapsible>
  )
}
