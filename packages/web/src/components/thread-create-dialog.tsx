import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [threadTitle, setThreadTitle] = useState('')
  const [provider, setProvider] = useState('opencode')
  const [commandMode, setCommandMode] = useState<'default' | 'append' | 'replace'>('default')
  const [commandArgsRaw, setCommandArgsRaw] = useState('')
  const [baseBranch, setBaseBranch] = useState('')

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
  }, [
    open,
    initialProjectId,
    snapshot.projects,
    snapshot.providers.list,
    branchSuggestions,
  ])

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
      return
    }

    if (snapshot.create.pending || snapshot.create.error) {
      return
    }

    if (threadTitle.trim().length === 0) {
      return
    }

    onOpenChange(false)
    setThreadTitle('')
    setCommandMode('default')
    setCommandArgsRaw('')
  }, [snapshot.create.pending, snapshot.create.error, threadTitle, open, onOpenChange])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger />
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
                placeholder={commandMode === 'append' ? '--model gpt-5 --approval on-failure' : 'opencode --model gpt-5'}
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
            <div className="rounded-md border border-destructive/70 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {snapshot.create.error}
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
