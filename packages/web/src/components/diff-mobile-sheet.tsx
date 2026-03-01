import { ChevronLeft, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ParsedDiffFile } from '@/diff/diff-types'
import { DiffFileSection } from '@/components/diff-file-section'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type DiffMobileSheetProps = {
  open: boolean
  files: ParsedDiffFile[]
  loading: boolean
  error: string | null
  updatedAt?: string | null
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
  refreshAction?: ReactNode
}

function formatUpdatedAt(updatedAt: string | null | undefined): string {
  if (!updatedAt) {
    return 'Waiting for diff snapshot'
  }

  const parsed = Date.parse(updatedAt)
  if (!Number.isFinite(parsed)) {
    return 'Updated just now'
  }

  const deltaMs = Date.now() - parsed
  const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000))
  if (deltaSeconds < 5) {
    return 'Updated just now'
  }
  if (deltaSeconds < 60) {
    return `Updated ${deltaSeconds}s ago`
  }
  return `Updated ${Math.floor(deltaSeconds / 60)}m ago`
}

export function DiffMobileSheet({
  open,
  files,
  loading,
  error,
  updatedAt,
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
              <SheetClose render={<Button type="button" variant="ghost" size="icon" aria-label="Back to terminal" />}>
                <ChevronLeft className="h-4 w-4" />
              </SheetClose>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Code Diff</p>
                <SheetTitle className="text-sm font-medium">{files.length} changed files</SheetTitle>
                <p className="text-xs text-muted-foreground">{formatUpdatedAt(updatedAt)}</p>
              </div>
            </div>
            {refreshAction ?? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="diff-refresh-button-mobile"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh diff"
                title="Refresh diff"
              >
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              </Button>
            )}
          </div>
        </SheetHeader>

        <Separator />

        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            {loading ? <p className="text-sm text-muted-foreground">Refreshing changes from active thread...</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uncommitted changes in this thread.</p>
            ) : (
              files.map((file) => <DiffFileSection key={file.path} file={file} />)
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
