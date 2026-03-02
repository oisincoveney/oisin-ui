import { ChevronDown, Circle, Plus, X } from 'lucide-react'
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { switchToThread, useThreadStoreSnapshot, getThreadActionLockReason } from '@/thread/thread-store'
import { cn } from '@/lib/utils'
import { ThreadCreateDialog } from '@/components/thread-create-dialog'
import { ThreadDeleteDialog } from '@/components/thread-delete-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  const actionLockReason = getThreadActionLockReason(snapshot)
  const actionsLocked = Boolean(actionLockReason)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [deleteDialogTarget, setDeleteDialogTarget] = useState<{
    projectId: string
    threadId: string
    title: string
  } | null>(null)

  return (
    <>
      <TooltipProvider delay={100}>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Threads</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Projects</p>
                  {actionsLocked ? (
                    <span
                      className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
                      aria-label="Warm-up in progress"
                    >
                      Warm-up
                    </span>
                  ) : null}
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    size="sm"
                    className="h-8"
                    aria-label="Create new thread"
                    disabled={actionsLocked}
                    onClick={() => {
                      setCreateProjectId(snapshot.projects[0]?.projectId ?? null)
                      setCreateDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Thread
                  </Button>
                </TooltipTrigger>
                {actionsLocked ? <TooltipContent>{actionLockReason}</TooltipContent> : null}
              </Tooltip>
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
                          <CollapsibleTrigger render={<SidebarMenuButton />}>
                            <span className="truncate">{project.displayName}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>{threads.length}</span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </span>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="pt-1">
                            <div className="mb-1 pl-2">
                              <Tooltip>
                                <TooltipTrigger render={<span />}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-full justify-start text-xs"
                                    disabled={actionsLocked}
                                    onClick={() => {
                                      setCreateProjectId(project.projectId)
                                      setCreateDialogOpen(true)
                                    }}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    New Thread
                                  </Button>
                                </TooltipTrigger>
                                {actionsLocked ? <TooltipContent>{actionLockReason}</TooltipContent> : null}
                              </Tooltip>
                            </div>

                            <SidebarMenu className="space-y-1 pl-2">
                              {threads.map((thread) => {
                                const threadKey = `${project.projectId}:${thread.threadId}`
                                const isActive = snapshot.activeThreadKey === threadKey

                                return (
                                  <SidebarMenuItem key={thread.threadId}>
                                    <SidebarMenuButton
                                        isActive={isActive}
                                        disabled={actionsLocked}
                                        title={actionsLocked ? (actionLockReason ?? undefined) : undefined}
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
                                            <Circle
                                              className={cn(
                                                'h-2.5 w-2.5 fill-current stroke-current',
                                                statusTone(thread.status),
                                              )}
                                            />
                                            <span>{thread.status}</span>
                                            <span>{formatRelativeTime(thread.lastOutputAt ?? thread.updatedAt)}</span>
                                          </div>
                                        </div>
                                      </SidebarMenuButton>

                                    <Tooltip>
                                      <TooltipTrigger
                                        render={
                                          <SidebarMenuAction
                                            showOnHover
                                            disabled={actionsLocked}
                                            onClick={() => {
                                              setDeleteDialogTarget({
                                                projectId: project.projectId,
                                                threadId: thread.threadId,
                                                title: thread.title,
                                              })
                                            }}
                                            aria-label={`Delete ${thread.title}`}
                                          />
                                        }
                                      >
                                        <X />
                                      </TooltipTrigger>
                                      {actionsLocked ? (
                                        <TooltipContent>{actionLockReason}</TooltipContent>
                                      ) : (
                                        <TooltipContent>Delete {thread.title}</TooltipContent>
                                      )}
                                    </Tooltip>
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
      </TooltipProvider>

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
