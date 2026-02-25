import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wsMocks = vi.hoisted(() => {
  return {
    sendWsMessage: vi.fn(),
    subscribeTextMessages: vi.fn(),
    subscribeConnectionStatus: vi.fn(),
    textListener: null as ((message: unknown) => void) | null,
    connectionListener: null as ((status: 'connecting' | 'reconnecting' | 'connected' | 'disconnected') => void) | null,
  }
})

vi.mock('@/lib/ws', () => ({
  sendWsMessage: wsMocks.sendWsMessage,
  subscribeTextMessages: wsMocks.subscribeTextMessages,
  subscribeConnectionStatus: wsMocks.subscribeConnectionStatus,
}))

type ThreadStoreModule = Awaited<typeof import('./thread-store')>

const validCreateInput = {
  projectId: 'proj-1',
  title: 'reliability-check',
  provider: 'opencode',
  modeId: null,
  commandMode: 'default' as const,
  commandArgs: [],
  baseBranch: 'main',
}

async function loadThreadStore(): Promise<ThreadStoreModule> {
  vi.resetModules()
  return import('./thread-store')
}

function getLastSentRequestByType<T extends { type: string }>(type: string): T {
  for (let index = wsMocks.sendWsMessage.mock.calls.length - 1; index >= 0; index -= 1) {
    const candidate = wsMocks.sendWsMessage.mock.calls[index]?.[0] as T | undefined
    if (candidate?.type === type) {
      return candidate
    }
  }
  throw new Error(`No websocket request found for type ${type}`)
}

async function seedStoreWithThreads(
  store: ThreadStoreModule,
  activeThreadId: string,
  threads: Array<{ threadId: string; title: string; terminalId: string }>
): Promise<void> {
  store.startThreadStore()
  wsMocks.connectionListener?.('connected')

  const projectListRequest = getLastSentRequestByType<{ type: string; requestId: string }>('project_list_request')
  wsMocks.textListener?.({
    type: 'project_list_response',
    payload: {
      requestId: projectListRequest.requestId,
      projects: [
        {
          projectId: 'proj-1',
          displayName: 'Project 1',
          repoRoot: '/tmp/proj-1',
          activeThreadId,
        },
      ],
    },
  })

  const threadListRequest = getLastSentRequestByType<{ type: string; requestId: string }>('thread_list_request')
  wsMocks.textListener?.({
    type: 'thread_list_response',
    payload: {
      requestId: threadListRequest.requestId,
      activeThreadId,
      threads: threads.map((thread, index) => ({
        projectId: 'proj-1',
        threadId: thread.threadId,
        title: thread.title,
        terminalId: thread.terminalId,
        status: 'running',
        unreadCount: 0,
        updatedAt: new Date(Date.now() - index * 1_000).toISOString(),
      })),
    },
  })
}

beforeEach(() => {
  wsMocks.sendWsMessage.mockReset()
  wsMocks.subscribeTextMessages.mockReset()
  wsMocks.subscribeConnectionStatus.mockReset()
  wsMocks.textListener = null
  wsMocks.connectionListener = null

  wsMocks.subscribeTextMessages.mockImplementation((listener: (message: unknown) => void) => {
    wsMocks.textListener = listener
    return () => {
      if (wsMocks.textListener === listener) {
        wsMocks.textListener = null
      }
    }
  })

  wsMocks.subscribeConnectionStatus.mockImplementation(
    (listener: (status: 'connecting' | 'reconnecting' | 'connected' | 'disconnected') => void) => {
      wsMocks.connectionListener = listener
      return () => {
        if (wsMocks.connectionListener === listener) {
          wsMocks.connectionListener = null
        }
      }
    }
  )
})

afterEach(async () => {
  vi.useRealTimers()
  const store = await loadThreadStore()
  store.stopThreadStore()
})

describe('thread create lifecycle', () => {
  it('returns immediate structured error when websocket send fails', async () => {
    wsMocks.sendWsMessage.mockReturnValue(false)
    const store = await loadThreadStore()

    store.createThread(validCreateInput)

    const snapshot = store.getThreadStoreSnapshot()
    expect(snapshot.create.pending).toBe(false)
    expect(snapshot.create.error?.summary).toContain('could not be sent')
    expect(snapshot.create.error?.details).toContain('readyState was not OPEN')
    expect(snapshot.create.error?.requestId).toMatch(/^thread-create-/)
    expect(snapshot.create.error?.copyText).toContain('Request ID:')
  })

  it('clears pending exactly at timeout boundary', async () => {
    vi.useFakeTimers()
    wsMocks.sendWsMessage.mockReturnValue(true)
    const store = await loadThreadStore()

    store.createThread(validCreateInput)
    expect(store.getThreadStoreSnapshot().create.pending).toBe(true)

    vi.advanceTimersByTime(119_999)
    expect(store.getThreadStoreSnapshot().create.pending).toBe(true)

    vi.advanceTimersByTime(1)
    const snapshot = store.getThreadStoreSnapshot()
    expect(snapshot.create.pending).toBe(false)
    expect(snapshot.create.error?.summary).toContain('timed out')
    expect(snapshot.create.error?.details).toContain('120s')
  })

  it('maps bootstrap failure to concise summary and keeps detailed diagnostics', async () => {
    wsMocks.sendWsMessage.mockReturnValue(true)
    const store = await loadThreadStore()
    store.startThreadStore()

    store.createThread(validCreateInput)
    const request = wsMocks.sendWsMessage.mock.calls[0]?.[0] as { requestId?: string } | undefined
    const requestId = request?.requestId
    expect(requestId).toBeTruthy()

    wsMocks.textListener?.({
      type: 'thread_create_response',
      payload: {
        requestId,
        accepted: false,
        thread: null,
        project: null,
        error: 'Bootstrap failed: spawn ENOENT\nstack: launch-thread-runtime',
      },
    })

    const snapshot = store.getThreadStoreSnapshot()
    expect(snapshot.create.pending).toBe(false)
    expect(snapshot.create.error?.summary).toBe('Create Thread failed during bootstrap.')
    expect(snapshot.create.error?.details).toContain('spawn ENOENT')
    expect(snapshot.create.error?.copyText).toContain('stack: launch-thread-runtime')
    expect(snapshot.create.error?.copyText).toContain(String(requestId))
  })

  it('clears pending create state when store stops', async () => {
    wsMocks.sendWsMessage.mockReturnValue(true)
    const store = await loadThreadStore()
    store.startThreadStore()

    store.createThread(validCreateInput)
    expect(store.getThreadStoreSnapshot().create.pending).toBe(true)

    store.stopThreadStore()
    expect(store.getThreadStoreSnapshot().create.pending).toBe(false)
  })
})

describe('thread delete reliability', () => {
  it('keeps no active thread after successful active delete and removes sidebar row', async () => {
    wsMocks.sendWsMessage.mockReturnValue(true)
    const store = await loadThreadStore()

    await seedStoreWithThreads(store, 'thread-active', [
      { threadId: 'thread-active', title: 'Active thread', terminalId: 'term-a' },
      { threadId: 'thread-other', title: 'Other thread', terminalId: 'term-b' },
    ])

    store.requestDeleteThread('proj-1', 'thread-active', false)
    expect(store.getThreadStoreSnapshot().activeThreadKey).toBeNull()

    const deleteRequest = getLastSentRequestByType<{ type: string; requestId: string }>('thread_delete_request')
    wsMocks.textListener?.({
      type: 'thread_delete_response',
      payload: {
        requestId: deleteRequest.requestId,
      },
    })

    const snapshot = store.getThreadStoreSnapshot()
    expect(snapshot.activeThreadKey).toBeNull()
    expect(snapshot.threadsByProjectId['proj-1']?.map((thread) => thread.threadId)).toEqual(['thread-other'])
  })

  it('restores previous active thread when active delete fails', async () => {
    wsMocks.sendWsMessage.mockReturnValue(true)
    const store = await loadThreadStore()

    await seedStoreWithThreads(store, 'thread-active', [
      { threadId: 'thread-active', title: 'Active thread', terminalId: 'term-a' },
      { threadId: 'thread-other', title: 'Other thread', terminalId: 'term-b' },
    ])

    store.requestDeleteThread('proj-1', 'thread-active', false)
    expect(store.getThreadStoreSnapshot().activeThreadKey).toBeNull()

    const deleteRequest = getLastSentRequestByType<{ type: string; requestId: string }>('thread_delete_request')
    wsMocks.textListener?.({
      type: 'thread_delete_response',
      payload: {
        requestId: deleteRequest.requestId,
        error: 'Delete failed',
      },
    })

    const snapshot = store.getThreadStoreSnapshot()
    expect(snapshot.activeThreadKey).toBe('proj-1:thread-active')
    expect(snapshot.delete.error).toBe('Delete failed')
  })
})
