import { ChevronDown, RefreshCw, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ParsedDiffFile } from '@/diff/diff-types'
import { sendCommitRequest, sendStageRequest, sendUnstageRequest, subscribeCommitResponses } from '@/diff/diff-store'
import { DiffFileSection } from '@/components/diff-file-section'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type DiffPanelProps = {
  stagedFiles: ParsedDiffFile[]
  unstagedFiles: ParsedDiffFile[]
  cwd: string | null
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
  stagedFiles,
  unstagedFiles,
  cwd,
  loading,
  error,
  updatedAt,
  onClose,
  onRefresh,
  refreshAction,
}: DiffPanelProps) {
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [pendingCommitCwd, setPendingCommitCwd] = useState<string | null>(null)

  useEffect(() => {
    return subscribeCommitResponses((payload) => {
      if (!pendingCommitCwd || payload.cwd !== pendingCommitCwd) {
        return
      }

      setIsCommitting(false)
      setPendingCommitCwd(null)

      if (payload.success) {
        setCommitMessage('')
        return
      }

      toast.error(payload.error?.message ?? 'Commit failed')
    })
  }, [pendingCommitCwd])

  const sortedStaged = [...stagedFiles].sort((a, b) => a.path.localeCompare(b.path))
  const sortedUnstaged = [...unstagedFiles].sort((a, b) => a.path.localeCompare(b.path))
  const hasNoChanges = stagedFiles.length === 0 && unstagedFiles.length === 0

  return (
    <section data-testid="diff-panel" className="flex h-full min-h-0 min-w-0 w-full flex-col bg-card">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Code Diff</p>
          <p data-testid="diff-files-count" className="truncate text-sm font-medium text-foreground">
            {stagedFiles.length + unstagedFiles.length} changed files
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

      <form
        className="flex gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          const message = commitMessage.trim()
          if (!cwd || !message || stagedFiles.length === 0) {
            return
          }

          setIsCommitting(true)
          setPendingCommitCwd(cwd)
          sendCommitRequest(cwd, message)
        }}
      >
        <Input
          placeholder="Commit message"
          value={commitMessage}
          onChange={(event) => {
            setCommitMessage(event.target.value)
          }}
          disabled={isCommitting || !cwd}
          className="h-8 flex-1 text-sm"
          aria-label="Commit message"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!commitMessage.trim() || stagedFiles.length === 0 || isCommitting || !cwd}
        >
          Commit
        </Button>
      </form>

      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {loading ? <p className="text-sm text-muted-foreground">Refreshing changes from active thread...</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {hasNoChanges && !loading ? <p className="text-sm text-muted-foreground">No changes</p> : null}

          {sortedStaged.length > 0 ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/35 rounded-sm">
                <span>Staged ({sortedStaged.length})</span>
                <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 px-3 pb-3">
                  {sortedStaged.map((file) => (
                    <DiffFileSection
                      key={file.path}
                      file={file}
                      isStaged
                      onStage={() => {
                        return
                      }}
                      onUnstage={(path) => {
                        if (!cwd) {
                          return
                        }
                        sendUnstageRequest(cwd, path)
                      }}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {sortedUnstaged.length > 0 ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/35 rounded-sm">
                <span>Unstaged ({sortedUnstaged.length})</span>
                <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 px-3 pb-3">
                  {sortedUnstaged.map((file) => (
                    <DiffFileSection
                      key={file.path}
                      file={file}
                      isStaged={false}
                      onStage={(path) => {
                        if (!cwd) {
                          return
                        }
                        sendStageRequest(cwd, path)
                      }}
                      onUnstage={() => {
                        return
                      }}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  )
}
