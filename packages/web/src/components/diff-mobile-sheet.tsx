import { ChevronLeft, FileCode2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ParsedDiffFile } from '@/diff/diff-types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type DiffMobileSheetProps = {
  open: boolean
  files: ParsedDiffFile[]
  loading: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
  refreshAction?: ReactNode
}

function formatStatus(file: ParsedDiffFile): string | null {
  if (file.status === 'binary') {
    return 'binary'
  }
  if (file.status === 'too_large') {
    return 'large'
  }
  return null
}

export function DiffMobileSheet({
  open,
  files,
  loading,
  error,
  onOpenChange,
  onRefresh,
  refreshAction,
}: DiffMobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-none flex-col gap-0 p-0 sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="space-y-0 px-3 py-2 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Back to terminal">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </SheetClose>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Code Diff</p>
                <SheetTitle className="text-sm font-medium">{files.length} changed files</SheetTitle>
              </div>
            </div>
            {refreshAction ?? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                aria-label="Refresh diff"
                title="Refresh diff"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <Separator />

        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            {loading ? <p className="text-sm text-muted-foreground">Refreshing changes...</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uncommitted changes in this thread.</p>
            ) : (
              files.map((file) => {
                const statusLabel = formatStatus(file)
                return (
                  <article
                    key={file.path}
                    className="rounded-md border border-border/70 bg-background/70 px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{file.path}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="text-emerald-500">+{file.additions}</span>
                          <span className="mx-2 text-border">/</span>
                          <span className="text-rose-500">-{file.deletions}</span>
                          {statusLabel ? <span className="ml-2 uppercase tracking-wide">{statusLabel}</span> : null}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
