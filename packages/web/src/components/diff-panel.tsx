import { RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ParsedDiffFile } from '@/diff/diff-types'
import { DiffFileSection } from '@/components/diff-file-section'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type DiffPanelProps = {
  files: ParsedDiffFile[]
  loading: boolean
  error: string | null
  updatedAt?: string | null
  onClose: () => void
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

export function DiffPanel({
  files,
  loading,
  error,
  updatedAt,
  onClose,
  onRefresh,
  refreshAction,
}: DiffPanelProps) {
  return (
    <section data-testid="diff-panel" className="flex h-full min-w-0 flex-col bg-card">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Code Diff</p>
          <p data-testid="diff-files-count" className="truncate text-sm font-medium text-foreground">
            {files.length} changed files
          </p>
          <p className="text-xs text-muted-foreground">{formatUpdatedAt(updatedAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          {refreshAction ?? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="diff-refresh-button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh diff"
              title="Refresh diff"
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close diff panel"
            title="Close diff panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

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
    </section>
  )
}
