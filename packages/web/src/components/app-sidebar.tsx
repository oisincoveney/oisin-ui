import { ChevronDown, Circle, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { switchToThread, useThreadStoreSnapshot } from '@/thread/thread-store'
import { cn } from '@/lib/utils'
import { ThreadCreateDialog } from '@/components/thread-create-dialog'
import { ThreadDeleteDialog } from '@/components/thread-delete-dialog'

function statusTone(status: string): string {
  switch (status) {
    case 'running':
      return 'text-emerald-400'
    case 'error':
      return 'text-destructive'
    case 'idle':
      return 'text-amber-300'
    case 'closed':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function formatRelativeTime(isoTime: string | null | undefined): string {
  if (!isoTime) {
    return 'now'
  }

  const timestamp = Date.parse(isoTime)
  if (!Number.isFinite(timestamp)) {
    return 'now'
  }

  const deltaMs = Math.max(0, Date.now() - timestamp)
  const deltaMin = Math.floor(deltaMs / 60000)

  if (deltaMin < 1) {
    return 'now'
  }
  if (deltaMin < 60) {
    return `${deltaMin}m`
  }

  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) {
    return `${deltaHours}h`
  }

  const deltaDays = Math.floor(deltaHours / 24)
  return `${deltaDays}d`
}

export function AppSidebar() {
  const snapshot = useThreadStoreSnapshot()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [deleteDialogTarget, setDeleteDialogTarget] = useState<{
    projectId: string
    threadId: string
    title: string
  } | null>(null)

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Threads</p>
              <p className="text-sm font-semibold text-foreground">Projects</p>
            </div>
            <Button
              size="sm"
              className="h-8"
              aria-label="Create new thread"
              onClick={() => {
                setCreateProjectId(snapshot.projects[0]?.projectId ?? null)
                setCreateDialogOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Thread
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Configured Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {snapshot.projects.map((project) => {
                  const threads = snapshot.threadsByProjectId[project.projectId] ?? []

                  return (
                    <SidebarMenuItem key={project.projectId}>
                      <Collapsible defaultOpen>
                        <CollapsibleTrigger
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium',
                            'text-foreground/90 hover:bg-accent/60 hover:text-accent-foreground'
                          )}
                        >
                          <span className="truncate">{project.displayName}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>{threads.length}</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </span>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="pt-1">
                          <div className="mb-1 pl-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-full justify-start text-xs"
                              onClick={() => {
                                setCreateProjectId(project.projectId)
                                setCreateDialogOpen(true)
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              New Thread
                            </Button>
                          </div>

                          <SidebarMenu className="space-y-1 pl-2">
                            {threads.map((thread) => {
                              const threadKey = `${project.projectId}:${thread.threadId}`
                              const isActive = snapshot.activeThreadKey === threadKey

                              return (
                                <SidebarMenuItem key={thread.threadId}>
                                  <div className="group flex items-start gap-1">
                                    <SidebarMenuButton
                                      isActive={isActive}
                                      onClick={() => {
                                        switchToThread(project.projectId, thread.threadId)
                                      }}
                                      className="items-start"
                                    >
                                      <div className="flex min-w-0 flex-1 flex-col">
                                        <div className="flex items-center gap-2">
                                          <span className="truncate">{thread.title}</span>
                                          {thread.unreadCount > 0 ? (
                                            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" />
                                          ) : null}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                          <Circle className={cn('h-2.5 w-2.5 fill-current stroke-current', statusTone(thread.status))} />
                                          <span>{thread.status}</span>
                                          <span>{formatRelativeTime(thread.lastOutputAt ?? thread.updatedAt)}</span>
                                        </div>
                                      </div>
                                    </SidebarMenuButton>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="mt-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                      onClick={() => {
                                        setDeleteDialogTarget({
                                          projectId: project.projectId,
                                          threadId: thread.threadId,
                                          title: thread.title,
                                        })
                                      }}
                                      aria-label={`Delete ${thread.title}`}
                                      title={`Delete ${thread.title}`}
                                    >
                                      <span className="text-xs">x</span>
                                    </Button>
                                  </div>
                                </SidebarMenuItem>
                              )
                            })}
                          </SidebarMenu>
                        </CollapsibleContent>
                      </Collapsible>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <ThreadCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialProjectId={createProjectId}
      />

      {deleteDialogTarget ? (
        <ThreadDeleteDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setDeleteDialogTarget(null)
            }
          }}
          projectId={deleteDialogTarget.projectId}
          threadId={deleteDialogTarget.threadId}
          threadTitle={deleteDialogTarget.title}
        />
      ) : null}
    </>
  )
}
