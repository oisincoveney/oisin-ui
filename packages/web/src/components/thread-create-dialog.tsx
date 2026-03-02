import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearCreateThreadError,
  createThread,
  listBranchSuggestions,
  listProviders,
  useThreadStoreSnapshot,
} from '@/thread/thread-store'

function parseCommandArgs(input: string): string[] {
  return input
    .split(' ')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

type ThreadCreateDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
  initialProjectId?: string | null
}

export function ThreadCreateDialog({ open, onOpenChange, initialProjectId }: ThreadCreateDialogProps) {
  const snapshot = useThreadStoreSnapshot()
  const createRequestedRef = useRef(false)
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [threadTitle, setThreadTitle] = useState('')
  const [provider, setProvider] = useState('opencode')
  const [commandMode, setCommandMode] = useState<'default' | 'append' | 'replace'>('default')
  const [commandArgsRaw, setCommandArgsRaw] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')

  const providerOptions = useMemo(() => {
    if (snapshot.providers.list.length > 0) {
      return snapshot.providers.list.filter((entry) => entry.available).map((entry) => entry.provider)
    }
    return ['opencode']
  }, [snapshot.providers.list])

  const branchSuggestions = snapshot.branchSuggestionsByProjectId[projectId]?.branches ?? []

  useEffect(() => {
    if (!open) {
      return
    }

    clearCreateThreadError()
    listProviders()

    const preferredProjectId =
      initialProjectId && snapshot.projects.some((project) => project.projectId === initialProjectId)
        ? initialProjectId
        : snapshot.projects[0]?.projectId

    if (preferredProjectId) {
      setProjectId(preferredProjectId)
      listBranchSuggestions(preferredProjectId)
      const suggestedBase =
        snapshot.projects.find((project) => project.projectId === preferredProjectId)?.defaultBaseBranch ??
        branchSuggestions[0]
      setBaseBranch(suggestedBase ?? '')
    }
  }, [open, initialProjectId, snapshot.projects])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!projectId) {
      return
    }

    listBranchSuggestions(projectId)
  }, [open, projectId])

  useEffect(() => {
    if (!open) {
      createRequestedRef.current = false
      setDetailsOpen(false)
      setCopyState('idle')
      return
    }

    if (snapshot.create.pending) {
      createRequestedRef.current = true
      return
    }

    if (!createRequestedRef.current || snapshot.create.error) {
      return
    }

    onOpenChange(false)
    createRequestedRef.current = false
    setThreadTitle('')
    setCommandMode('default')
    setCommandArgsRaw('')
  }, [snapshot.create.pending, snapshot.create.error, open, onOpenChange])

  useEffect(() => {
    if (!snapshot.create.error) {
      setDetailsOpen(false)
      setCopyState('idle')
      return
    }

    setCopyState('idle')
    setDetailsOpen(Boolean(snapshot.create.error.details))
  }, [
    snapshot.create.error,
    snapshot.create.error?.summary,
    snapshot.create.error?.details,
    snapshot.create.error?.requestId,
  ])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!providerOptions.includes(provider)) {
      setProvider(providerOptions[0] ?? 'opencode')
    }
  }, [open, provider, providerOptions])

  const submitDisabled =
    snapshot.create.pending ||
    !projectId ||
    threadTitle.trim().length === 0 ||
    provider.trim().length === 0 ||
    baseBranch.trim().length === 0 ||
    (commandMode === 'replace' && parseCommandArgs(commandArgsRaw).length === 0)

  async function handleCopyErrorDetails(): Promise<void> {
    const payload = snapshot.create.error
    if (!payload) {
      return
    }

    try {
      await navigator.clipboard.writeText(payload.copyText)
      setCopyState('done')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Thread</DialogTitle>
          <DialogDescription>
            Name the thread, pick provider and command mode, then choose base branch.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="create-thread-project">Project</Label>
            <select
              id="create-thread-project"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(event) => {
                const nextProjectId = event.target.value
                setProjectId(nextProjectId)
                listBranchSuggestions(nextProjectId)
                const nextDefault =
                  snapshot.projects.find((project) => project.projectId === nextProjectId)?.defaultBaseBranch ??
                  snapshot.branchSuggestionsByProjectId[nextProjectId]?.branches[0] ??
                  ''
                setBaseBranch(nextDefault)
              }}
              disabled={snapshot.create.pending}
            >
              {snapshot.projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-thread-title">Thread Name</Label>
            <Input
              id="create-thread-title"
              placeholder="feature/proj-thread"
              value={threadTitle}
              onChange={(event) => setThreadTitle(event.target.value)}
              disabled={snapshot.create.pending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="create-thread-provider">Provider</Label>
              <select
                id="create-thread-provider"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                disabled={snapshot.create.pending || snapshot.providers.pending}
              >
                {providerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-thread-command-mode">Command</Label>
              <select
                id="create-thread-command-mode"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={commandMode}
                onChange={(event) => setCommandMode(event.target.value as 'default' | 'append' | 'replace')}
                disabled={snapshot.create.pending}
              >
                <option value="default">Default</option>
                <option value="append">Append args</option>
                <option value="replace">Replace command</option>
              </select>
            </div>
          </div>

          {commandMode !== 'default' ? (
            <div className="space-y-1.5">
              <Label htmlFor="create-thread-command-args">
                {commandMode === 'append' ? 'Arguments' : 'Command + arguments'}
              </Label>
              <Input
                id="create-thread-command-args"
                placeholder={
                  commandMode === 'append' ? '--model gpt-5 --approval on-failure' : 'opencode --model gpt-5'
                }
                value={commandArgsRaw}
                onChange={(event) => setCommandArgsRaw(event.target.value)}
                disabled={snapshot.create.pending}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="create-thread-base-branch">Base Branch</Label>
            <Input
              id="create-thread-base-branch"
              list="create-thread-base-branch-suggestions"
              value={baseBranch}
              onChange={(event) => setBaseBranch(event.target.value)}
              disabled={snapshot.create.pending || !projectId}
              placeholder="main"
            />
            <datalist id="create-thread-base-branch-suggestions">
              {branchSuggestions.map((branch) => (
                <option key={branch} value={branch} />
              ))}
            </datalist>
          </div>

          {snapshot.create.error ? (
            <div className="space-y-2 rounded-md border border-destructive/70 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p>{snapshot.create.error.summary}</p>
              {snapshot.create.error.details ? (
                <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-destructive underline-offset-2 hover:underline">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                    Technical details
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 max-h-40 overflow-auto rounded border border-destructive/40 bg-background/80 p-2 text-xs text-foreground">
                      {snapshot.create.error.details}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleCopyErrorDetails}>
                  {copyState === 'done' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy details
                </Button>
                {copyState === 'done' ? <span className="text-xs text-foreground">Copied</span> : null}
                {copyState === 'error' ? <span className="text-xs text-foreground">Copy failed</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={snapshot.create.pending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              createThread({
                projectId,
                title: threadTitle,
                provider,
                commandMode,
                commandArgs: parseCommandArgs(commandArgsRaw),
                baseBranch,
              })
            }}
            disabled={submitDisabled}
          >
            {snapshot.create.pending ? 'Creating…' : 'Create Thread'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
