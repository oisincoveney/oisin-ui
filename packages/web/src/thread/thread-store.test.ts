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
