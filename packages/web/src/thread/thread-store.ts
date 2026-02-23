import { useSyncExternalStore } from 'react'
import {
  sendWsMessage,
  subscribeConnectionStatus,
  subscribeTextMessages,
  type ConnectionStatus,
} from '@/lib/ws'

type SessionMessage = {
  type: string
  payload?: any
}

export type ProjectSummary = {
  projectId: string
  displayName: string
  repoRoot: string
  defaultBaseBranch?: string | null
  activeThreadId?: string | null
}

export type ThreadSummary = {
  projectId: string
  threadId: string
  title: string
  status: 'running' | 'idle' | 'error' | 'closed' | 'unknown'
  unreadCount: number
  worktreePath?: string | null
  terminalId?: string | null
  agentId?: string | null
  updatedAt: string
  lastOutputAt?: string | null
  lastStatusAt?: string | null
}

export type ActiveThreadDiffTarget = {
  projectId: string
  threadId: string
  threadKey: string
  cwd: string
}

export type ThreadLaunchConfigInput = {
  projectId: string
  title: string
  provider: string
  modeId?: string | null
  commandMode: 'default' | 'append' | 'replace'
  commandArgs: string[]
  baseBranch: string
}

type ProviderAvailability = {
  provider: string
  available: boolean
  error?: string | null
}

export type ThreadStoreState = {
  connectionStatus: ConnectionStatus
  projects: ProjectSummary[]
  threadsByProjectId: Record<string, ThreadSummary[]>
  activeThreadKey: string | null
  loadingProjects: boolean
  create: {
    pending: boolean
    error: string | null
  }
  delete: {
    pending: boolean
    error: string | null
    requiresDirtyConfirm: boolean
    dirtyReason: string | null
    targetThreadKey: string | null
  }
  switch: {
    pending: boolean
    error: string | null
  }
  providers: {
    pending: boolean
    error: string | null
    list: ProviderAvailability[]
  }
  branchSuggestionsByProjectId: Record<
    string,
    {
      pending: boolean
      error: string | null
      branches: string[]
    }
  >
  toasts: Array<{
    id: string
    projectId: string
    threadId: string
    threadTitle: string
    status: 'error' | 'closed'
    message: string
  }>
}

type PendingRequest =
  | { kind: 'project-list' }
  | { kind: 'thread-list'; projectId: string }
  | { kind: 'thread-create'; title: string }
  | { kind: 'thread-delete'; projectId: string; threadId: string }
  | { kind: 'thread-switch'; projectId: string; threadId: string; previousActiveThreadKey: string | null }
  | { kind: 'provider-list' }
  | { kind: 'branch-suggestions'; projectId: string }

const listeners = new Set<() => void>()
const pendingRequests = new Map<string, PendingRequest>()

let started = false
let unsubscribeTextMessages: (() => void) | null = null
let unsubscribeConnectionStatus: (() => void) | null = null

const initialState: ThreadStoreState = {
  connectionStatus: 'disconnected',
  projects: [],
  threadsByProjectId: {},
  activeThreadKey: null,
  loadingProjects: false,
  create: {
    pending: false,
    error: null,
  },
  delete: {
    pending: false,
    error: null,
    requiresDirtyConfirm: false,
    dirtyReason: null,
    targetThreadKey: null,
  },
  switch: {
    pending: false,
    error: null,
  },
  providers: {
    pending: false,
    error: null,
    list: [],
  },
  branchSuggestionsByProjectId: {},
  toasts: [],
}

let state: ThreadStoreState = initialState

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setState(nextState: ThreadStoreState): void {
  state = nextState
  notify()
}

function updateState(updater: (previous: ThreadStoreState) => ThreadStoreState): void {
  setState(updater(state))
}

function randomRequestId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

function toThreadKey(projectId: string, threadId: string): string {
  return `${projectId}:${threadId}`
}

function parseThreadKey(key: string): { projectId: string; threadId: string } {
  const [projectId, ...rest] = key.split(':')
  return {
    projectId,
    threadId: rest.join(':'),
  }
}

function sortThreads(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt)
    const bTime = Date.parse(b.updatedAt)
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime
    }
    return a.title.localeCompare(b.title)
  })
}

function upsertThread(threads: ThreadSummary[], nextThread: ThreadSummary): ThreadSummary[] {
  const index = threads.findIndex((thread) => thread.threadId === nextThread.threadId)
  if (index === -1) {
    return sortThreads([...threads, nextThread])
  }

  const next = [...threads]
  next[index] = {
    ...next[index],
    ...nextThread,
  }
  return sortThreads(next)
}

function collectThreadOrder(snapshot: ThreadStoreState): Array<{ projectId: string; threadId: string }> {
  const ordered: Array<{ projectId: string; threadId: string }> = []
  for (const project of snapshot.projects) {
    const threads = snapshot.threadsByProjectId[project.projectId] ?? []
    for (const thread of threads) {
      ordered.push({ projectId: project.projectId, threadId: thread.threadId })
    }
  }
  return ordered
}

function deriveActiveThreadKey(snapshot: ThreadStoreState): string | null {
  if (snapshot.activeThreadKey) {
    return snapshot.activeThreadKey
  }

  for (const project of snapshot.projects) {
    const threads = snapshot.threadsByProjectId[project.projectId] ?? []
    const activeFromProject = project.activeThreadId
      ? threads.find((thread) => thread.threadId === project.activeThreadId)
      : null
    if (activeFromProject) {
      return toThreadKey(project.projectId, activeFromProject.threadId)
    }
  }

  for (const project of snapshot.projects) {
    const threads = snapshot.threadsByProjectId[project.projectId] ?? []
    if (threads.length > 0) {
      return toThreadKey(project.projectId, threads[0]!.threadId)
    }
  }

  return null
}

function sendRequest(request: Record<string, unknown>, pendingRequest: PendingRequest): void {
  const requestId = String(request.requestId)
  pendingRequests.set(requestId, pendingRequest)
  sendWsMessage(request)
}

function refreshProjectList(): void {
  const requestId = randomRequestId('project-list')
  updateState((previous) => ({
    ...previous,
    loadingProjects: true,
  }))

  sendRequest(
    {
      type: 'project_list_request',
      requestId,
    },
    { kind: 'project-list' }
  )
}

function refreshThreadList(projectId: string): void {
  const requestId = randomRequestId(`thread-list-${projectId}`)
  sendRequest(
    {
      type: 'thread_list_request',
      projectId,
      requestId,
    },
    { kind: 'thread-list', projectId }
  )
}

function parseDirtyDeleteError(error: string | null | undefined): string | null {
  if (!error) {
    return null
  }

  const normalized = error.toLowerCase()
  if (normalized.includes('dirty') || normalized.includes('uncommitted')) {
    return error
  }
  return null
}

function makeThreadStatusToast(input: {
  projectId: string
  threadId: string
  threadTitle: string
  status: 'error' | 'closed'
}): ThreadStoreState['toasts'][number] {
  return {
    id: randomRequestId('thread-toast'),
    projectId: input.projectId,
    threadId: input.threadId,
    threadTitle: input.threadTitle,
    status: input.status,
    message:
      input.status === 'error'
        ? `${input.threadTitle} exited with an error in the background.`
        : `${input.threadTitle} finished in the background.`,
  }
}

function pushThreadToast(
  snapshot: ThreadStoreState,
  toast: ThreadStoreState['toasts'][number]
): ThreadStoreState['toasts'] {
  const deduped = snapshot.toasts.filter(
    (entry) => !(entry.projectId === toast.projectId && entry.threadId === toast.threadId)
  )
  return [...deduped, toast].slice(-4)
}

function clearThreadUnread(projectId: string, threadId: string): void {
  updateState((previous) => {
    const currentThreads = previous.threadsByProjectId[projectId] ?? []
    const nextThreads = currentThreads.map((thread) => {
      if (thread.threadId !== threadId || thread.unreadCount === 0) {
        return thread
      }
      return {
        ...thread,
        unreadCount: 0,
      }
    })

    if (nextThreads === currentThreads) {
      return previous
    }

    return {
      ...previous,
      threadsByProjectId: {
        ...previous.threadsByProjectId,
        [projectId]: nextThreads,
      },
    }
  })
}

function handleProjectListResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'project-list') {
    return
  }
  pendingRequests.delete(requestId)

  const error = typeof message.payload?.error === 'string' ? message.payload.error : null
  const projects = Array.isArray(message.payload?.projects)
    ? (message.payload.projects as ProjectSummary[])
    : []

  updateState((previous) => {
    const nextProjectIds = new Set(projects.map((project) => project.projectId))
    const nextThreadsByProjectId: Record<string, ThreadSummary[]> = {}
    for (const project of projects) {
      nextThreadsByProjectId[project.projectId] = previous.threadsByProjectId[project.projectId] ?? []
    }

    let nextActiveThreadKey = previous.activeThreadKey
    if (
      nextActiveThreadKey &&
      !nextProjectIds.has(parseThreadKey(nextActiveThreadKey).projectId)
    ) {
      nextActiveThreadKey = null
    }

    const nextState: ThreadStoreState = {
      ...previous,
      loadingProjects: false,
      projects,
      threadsByProjectId: nextThreadsByProjectId,
      activeThreadKey: nextActiveThreadKey,
    }

    if (error) {
      nextState.create = {
        ...nextState.create,
        error,
      }
    }

    return nextState
  })

  for (const project of projects) {
    refreshThreadList(project.projectId)
  }
}

function handleThreadListResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'thread-list') {
    return
  }
  pendingRequests.delete(requestId)

  const projectId = pending.projectId
  const threads = Array.isArray(message.payload?.threads)
    ? sortThreads(message.payload.threads as ThreadSummary[])
    : []
  const activeThreadId =
    typeof message.payload?.activeThreadId === 'string' ? message.payload.activeThreadId : null

  updateState((previous) => {
    const nextState: ThreadStoreState = {
      ...previous,
      threadsByProjectId: {
        ...previous.threadsByProjectId,
        [projectId]: threads,
      },
      projects: previous.projects.map((project) =>
        project.projectId === projectId
          ? {
              ...project,
              activeThreadId,
            }
          : project
      ),
    }

    nextState.activeThreadKey = deriveActiveThreadKey(nextState)
    return nextState
  })
}

function handleThreadCreateResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'thread-create') {
    return
  }
  pendingRequests.delete(requestId)

  const thread = message.payload?.thread as ThreadSummary | null | undefined
  const error = typeof message.payload?.error === 'string' ? message.payload.error : null

  updateState((previous) => {
    const nextState: ThreadStoreState = {
      ...previous,
      create: {
        pending: false,
        error,
      },
    }

    if (!thread || error) {
      return nextState
    }

    const existingThreads = previous.threadsByProjectId[thread.projectId] ?? []
    const updatedThreads = upsertThread(existingThreads, {
      ...thread,
      unreadCount: 0,
    })
    nextState.threadsByProjectId = {
      ...previous.threadsByProjectId,
      [thread.projectId]: updatedThreads,
    }
    nextState.activeThreadKey = toThreadKey(thread.projectId, thread.threadId)

    return nextState
  })
}

function handleThreadSwitchResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'thread-switch') {
    return
  }
  pendingRequests.delete(requestId)

  const error = typeof message.payload?.error === 'string' ? message.payload.error : null
  const accepted = Boolean(message.payload?.accepted)

  updateState((previous) => {
    const nextState: ThreadStoreState = {
      ...previous,
      switch: {
        pending: false,
        error,
      },
    }

    if (!accepted || error) {
      nextState.activeThreadKey = pending.previousActiveThreadKey
      return nextState
    }

    nextState.activeThreadKey = toThreadKey(pending.projectId, pending.threadId)
    return nextState
  })

  if (accepted && !error) {
    clearThreadUnread(pending.projectId, pending.threadId)
  }
}

function handleThreadDeleteResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'thread-delete') {
    return
  }
  pendingRequests.delete(requestId)

  const error = typeof message.payload?.error === 'string' ? message.payload.error : null
  const dirtyReason = parseDirtyDeleteError(error)

  updateState((previous) => {
    const nextState: ThreadStoreState = {
      ...previous,
      delete: {
        pending: false,
        error,
        requiresDirtyConfirm: Boolean(dirtyReason),
        dirtyReason,
        targetThreadKey: toThreadKey(pending.projectId, pending.threadId),
      },
    }

    if (error) {
      return nextState
    }

    const previousThreads = previous.threadsByProjectId[pending.projectId] ?? []
    const remaining = previousThreads.filter((thread) => thread.threadId !== pending.threadId)
    nextState.threadsByProjectId = {
      ...previous.threadsByProjectId,
      [pending.projectId]: remaining,
    }

    const deletedThreadKey = toThreadKey(pending.projectId, pending.threadId)
    if (previous.activeThreadKey !== deletedThreadKey) {
      return nextState
    }

    const nextOrder = collectThreadOrder(nextState)
    if (nextOrder.length === 0) {
      nextState.activeThreadKey = null
      return nextState
    }

    const fallback = nextOrder[0]
    nextState.activeThreadKey = fallback ? toThreadKey(fallback.projectId, fallback.threadId) : null
    return nextState
  })
}

function handleThreadStatusUpdated(message: SessionMessage): void {
  const projectId = message.payload?.projectId
  const threadId = message.payload?.threadId
  if (typeof projectId !== 'string' || typeof threadId !== 'string') {
    return
  }

  const status = message.payload?.status
  const lastStatusAt =
    typeof message.payload?.lastStatusAt === 'string' ? message.payload.lastStatusAt : null

  updateState((previous) => {
    const current = previous.threadsByProjectId[projectId] ?? []
    const threadKey = toThreadKey(projectId, threadId)
    const isActiveThread = previous.activeThreadKey === threadKey
    let previousStatus: ThreadSummary['status'] | null = null
    let threadTitle = threadId
    const next = current.map((thread) => {
      if (thread.threadId !== threadId) {
        return thread
      }
      previousStatus = thread.status
      threadTitle = thread.title
      return {
        ...thread,
        status,
        lastStatusAt,
      }
    })

    const shouldToast =
      !isActiveThread &&
      (status === 'error' || status === 'closed') &&
      previousStatus !== null &&
      previousStatus !== status

    return {
      ...previous,
      threadsByProjectId: {
        ...previous.threadsByProjectId,
        [projectId]: next,
      },
      toasts: shouldToast
        ? pushThreadToast(
            previous,
            makeThreadStatusToast({
              projectId,
              threadId,
              threadTitle,
              status,
            })
          )
        : previous.toasts,
    }
  })
}

function handleThreadUnreadUpdated(message: SessionMessage): void {
  const projectId = message.payload?.projectId
  const threadId = message.payload?.threadId
  if (typeof projectId !== 'string' || typeof threadId !== 'string') {
    return
  }

  const unreadCount = Number.isFinite(Number(message.payload?.unreadCount))
    ? Number(message.payload?.unreadCount)
    : 0
  const lastOutputAt =
    typeof message.payload?.lastOutputAt === 'string' ? message.payload.lastOutputAt : null

  updateState((previous) => {
    const current = previous.threadsByProjectId[projectId] ?? []
    const next = current.map((thread) => {
      if (thread.threadId !== threadId) {
        return thread
      }
      return {
        ...thread,
        unreadCount,
        lastOutputAt,
      }
    })

    return {
      ...previous,
      threadsByProjectId: {
        ...previous.threadsByProjectId,
        [projectId]: next,
      },
    }
  })
}

function handleProviderListResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'provider-list') {
    return
  }
  pendingRequests.delete(requestId)

  const providers = Array.isArray(message.payload?.providers)
    ? (message.payload.providers as ProviderAvailability[])
    : []
  const error = typeof message.payload?.error === 'string' ? message.payload.error : null

  updateState((previous) => ({
    ...previous,
    providers: {
      pending: false,
      error,
      list: providers,
    },
  }))
}

function handleBranchSuggestionsResponse(message: SessionMessage): void {
  const requestId = message.payload?.requestId
  if (typeof requestId !== 'string') {
    return
  }

  const pending = pendingRequests.get(requestId)
  if (!pending || pending.kind !== 'branch-suggestions') {
    return
  }
  pendingRequests.delete(requestId)

  const branches = Array.isArray(message.payload?.branches)
    ? (message.payload.branches as string[])
    : []
  const error = typeof message.payload?.error === 'string' ? message.payload.error : null

  updateState((previous) => ({
    ...previous,
    branchSuggestionsByProjectId: {
      ...previous.branchSuggestionsByProjectId,
      [pending.projectId]: {
        pending: false,
        error,
        branches,
      },
    },
  }))
}

function handleEnsureDefaultTerminalResponse(message: SessionMessage): void {
  const projectId = typeof message.payload?.projectId === 'string' ? message.payload.projectId : null
  const resolvedThreadId =
    typeof message.payload?.resolvedThreadId === 'string' ? message.payload.resolvedThreadId : null
  const terminalId = typeof message.payload?.terminal?.id === 'string' ? message.payload.terminal.id : null

  if (!projectId || !resolvedThreadId) {
    return
  }

  updateState((previous) => {
    const activeThreadKey = toThreadKey(projectId, resolvedThreadId)
    const projectThreads = previous.threadsByProjectId[projectId] ?? []
    const nextThreads = projectThreads.map((thread) => {
      if (thread.threadId !== resolvedThreadId) {
        return thread
      }
      if (!terminalId || thread.terminalId === terminalId) {
        return thread
      }
      return {
        ...thread,
        terminalId,
      }
    })

    return {
      ...previous,
      activeThreadKey,
      threadsByProjectId: {
        ...previous.threadsByProjectId,
        [projectId]: nextThreads,
      },
    }
  })

  clearThreadUnread(projectId, resolvedThreadId)
}

function handleSessionMessage(rawMessage: unknown): void {
  const message = rawMessage as SessionMessage
  if (!message || typeof message.type !== 'string') {
    return
  }

  switch (message.type) {
    case 'project_list_response':
      handleProjectListResponse(message)
      return
    case 'thread_list_response':
      handleThreadListResponse(message)
      return
    case 'thread_create_response':
      handleThreadCreateResponse(message)
      return
    case 'thread_switch_response':
      handleThreadSwitchResponse(message)
      return
    case 'thread_delete_response':
      handleThreadDeleteResponse(message)
      return
    case 'thread_status_updated':
      handleThreadStatusUpdated(message)
      return
    case 'thread_unread_updated':
      handleThreadUnreadUpdated(message)
      return
    case 'list_available_providers_response':
      handleProviderListResponse(message)
      return
    case 'branch_suggestions_response':
      handleBranchSuggestionsResponse(message)
      return
    case 'ensure_default_terminal_response':
      handleEnsureDefaultTerminalResponse(message)
      return
    default:
      return
  }
}

function ensureStarted(): void {
  if (started) {
    return
  }
  started = true

  unsubscribeTextMessages = subscribeTextMessages(handleSessionMessage)
  unsubscribeConnectionStatus = subscribeConnectionStatus((nextStatus) => {
    updateState((previous) => ({
      ...previous,
      connectionStatus: nextStatus,
    }))

    if (nextStatus === 'connected') {
      refreshProjectList()
    }
  })
}

export function startThreadStore(): void {
  ensureStarted()
}

export function stopThreadStore(): void {
  if (!started) {
    return
  }

  started = false
  unsubscribeTextMessages?.()
  unsubscribeConnectionStatus?.()
  unsubscribeTextMessages = null
  unsubscribeConnectionStatus = null
}

export function subscribeThreadStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getThreadStoreSnapshot(): ThreadStoreState {
  return state
}

export function useThreadStoreSnapshot(): ThreadStoreState {
  ensureStarted()
  return useSyncExternalStore(subscribeThreadStore, getThreadStoreSnapshot, getThreadStoreSnapshot)
}

export function getActiveThread(snapshot = state): ThreadSummary | null {
  if (!snapshot.activeThreadKey) {
    return null
  }

  const { projectId, threadId } = parseThreadKey(snapshot.activeThreadKey)
  const threads = snapshot.threadsByProjectId[projectId] ?? []
  return threads.find((thread) => thread.threadId === threadId) ?? null
}

export function getActiveThreadDiffTarget(snapshot = state): ActiveThreadDiffTarget | null {
  if (!snapshot.activeThreadKey) {
    return null
  }

  const activeThread = getActiveThread(snapshot)
  if (!activeThread) {
    return null
  }

  const project = snapshot.projects.find((candidate) => candidate.projectId === activeThread.projectId)
  const cwd = activeThread.worktreePath ?? project?.repoRoot ?? null
  if (!cwd) {
    return null
  }

  return {
    projectId: activeThread.projectId,
    threadId: activeThread.threadId,
    threadKey: toThreadKey(activeThread.projectId, activeThread.threadId),
    cwd,
  }
}

export function switchToThread(projectId: string, threadId: string): void {
  const nextThreadKey = toThreadKey(projectId, threadId)
  const previousActiveThreadKey = state.activeThreadKey
  if (previousActiveThreadKey === nextThreadKey) {
    clearThreadUnread(projectId, threadId)
    return
  }

  updateState((previous) => ({
    ...previous,
    switch: {
      pending: true,
      error: null,
    },
    activeThreadKey: nextThreadKey,
  }))

  clearThreadUnread(projectId, threadId)

  const requestId = randomRequestId('thread-switch')
  sendRequest(
    {
      type: 'thread_switch_request',
      projectId,
      threadId,
      requestId,
    },
    {
      kind: 'thread-switch',
      projectId,
      threadId,
      previousActiveThreadKey,
    }
  )
}

export function switchRelativeThread(direction: -1 | 1): void {
  const order = collectThreadOrder(state)
  if (order.length === 0) {
    return
  }

  let currentIndex = 0
  if (state.activeThreadKey) {
    currentIndex = order.findIndex((entry) => toThreadKey(entry.projectId, entry.threadId) === state.activeThreadKey)
    if (currentIndex < 0) {
      currentIndex = 0
    }
  }

  const nextIndex = (currentIndex + direction + order.length) % order.length
  const next = order[nextIndex]
  if (!next) {
    return
  }
  switchToThread(next.projectId, next.threadId)
}

export function refreshThreads(): void {
  refreshProjectList()
}

export function listProviders(): void {
  updateState((previous) => ({
    ...previous,
    providers: {
      ...previous.providers,
      pending: true,
      error: null,
    },
  }))

  const requestId = randomRequestId('provider-list')
  sendRequest(
    {
      type: 'list_available_providers_request',
      requestId,
    },
    { kind: 'provider-list' }
  )
}

export function listBranchSuggestions(projectId: string, query?: string): void {
  const project = state.projects.find((candidate) => candidate.projectId === projectId)
  if (!project) {
    return
  }

  updateState((previous) => ({
    ...previous,
    branchSuggestionsByProjectId: {
      ...previous.branchSuggestionsByProjectId,
      [projectId]: {
        pending: true,
        error: null,
        branches: previous.branchSuggestionsByProjectId[projectId]?.branches ?? [],
      },
    },
  }))

  const requestId = randomRequestId(`branch-suggestions-${projectId}`)
  sendRequest(
    {
      type: 'branch_suggestions_request',
      cwd: project.repoRoot,
      ...(query ? { query } : {}),
      limit: 50,
      requestId,
    },
    { kind: 'branch-suggestions', projectId }
  )
}

export function createThread(input: ThreadLaunchConfigInput): void {
  const title = input.title.trim()
  const provider = input.provider.trim()
  const baseBranch = input.baseBranch.trim()

  if (!input.projectId || !title || !provider || !baseBranch) {
    updateState((previous) => ({
      ...previous,
      create: {
        pending: false,
        error: 'Project, thread name, provider, and base branch are required.',
      },
    }))
    return
  }

  if (input.commandMode === 'replace' && input.commandArgs.length === 0) {
    updateState((previous) => ({
      ...previous,
      create: {
        pending: false,
        error: 'Custom command is required when command mode is replace.',
      },
    }))
    return
  }

  updateState((previous) => ({
    ...previous,
    create: {
      pending: true,
      error: null,
    },
  }))

  const launchConfig: Record<string, unknown> = {
    provider,
    ...(input.modeId ? { modeId: input.modeId } : {}),
  }

  if (input.commandMode === 'append') {
    launchConfig.commandOverride = {
      mode: 'append',
      args: input.commandArgs,
    }
  } else if (input.commandMode === 'replace') {
    launchConfig.commandOverride = {
      mode: 'replace',
      argv: input.commandArgs,
    }
  }

  const requestId = randomRequestId('thread-create')
  sendRequest(
    {
      type: 'thread_create_request',
      projectId: input.projectId,
      title,
      launchConfig,
      baseBranch,
      requestId,
    },
    {
      kind: 'thread-create',
      title,
    }
  )
}

export function clearCreateThreadError(): void {
  updateState((previous) => ({
    ...previous,
    create: {
      ...previous.create,
      error: null,
    },
  }))
}

export function requestDeleteThread(projectId: string, threadId: string, force: boolean): void {
  updateState((previous) => ({
    ...previous,
    delete: {
      pending: true,
      error: null,
      requiresDirtyConfirm: false,
      dirtyReason: null,
      targetThreadKey: toThreadKey(projectId, threadId),
    },
  }))

  const requestId = randomRequestId('thread-delete')
  sendRequest(
    {
      type: 'thread_delete_request',
      projectId,
      threadId,
      forceDirtyDelete: force,
      requestId,
    },
    {
      kind: 'thread-delete',
      projectId,
      threadId,
    }
  )
}

export function dismissThreadToast(toastId: string): void {
  updateState((previous) => ({
    ...previous,
    toasts: previous.toasts.filter((toast) => toast.id !== toastId),
  }))
}

export function clearDeleteThreadError(): void {
  updateState((previous) => ({
    ...previous,
    delete: {
      ...previous.delete,
      error: null,
      requiresDirtyConfirm: false,
      dirtyReason: null,
      targetThreadKey: null,
    },
  }))
}

export function clearUnreadForActiveThread(): void {
  if (!state.activeThreadKey) {
    return
  }
  const { projectId, threadId } = parseThreadKey(state.activeThreadKey)
  clearThreadUnread(projectId, threadId)
}
