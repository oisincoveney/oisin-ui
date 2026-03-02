import { atom, getDefaultStore, useAtomValue } from 'jotai'
import { getConnectionStatus, sendWsMessage, subscribeConnectionStatus, subscribeTextMessages } from '@/lib/ws'
import type {
  CheckoutDiffPayload,
  DiffCacheEntry,
  DiffSessionMessage,
  DiffStoreState,
  ThreadDiffTarget,
} from './diff-types'

const MIN_PANEL_WIDTH_PERCENT = 30
const MAX_PANEL_WIDTH_PERCENT = 60
const DEFAULT_PANEL_WIDTH_PERCENT = 40

const jotaiStore = getDefaultStore()

let started = false
let unsubscribeTextMessages: (() => void) | null = null
let unsubscribeConnectionStatus: (() => void) | null = null
const commitResponseListeners = new Set<
  (payload: {
    cwd: string
    success: boolean
    error: { code: string; message: string } | null
    requestId: string
  }) => void
>()

const initialState: DiffStoreState = {
  connectionStatus: getConnectionStatus(),
  activeTarget: null,
  activeSubscriptionId: null,
  activeRequestId: null,
  loading: false,
  error: null,
  panel: {
    isOpen: false,
    widthPercent: DEFAULT_PANEL_WIDTH_PERCENT,
  },
  cacheByThreadKey: {},
}

let state: DiffStoreState = initialState

const diffStoreAtom = atom<DiffStoreState>(initialState)

function setState(nextState: DiffStoreState): void {
  state = nextState
  jotaiStore.set(diffStoreAtom, nextState)
}

function updateState(updater: (previous: DiffStoreState) => DiffStoreState): void {
  setState(updater(state))
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

function clampPanelWidthPercent(value: number): number {
  return Math.min(MAX_PANEL_WIDTH_PERCENT, Math.max(MIN_PANEL_WIDTH_PERCENT, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCheckoutDiffPayload(payload: unknown): CheckoutDiffPayload | null {
  if (!isRecord(payload)) {
    return null
  }

  const subscriptionId = payload.subscriptionId
  const cwd = payload.cwd
  const files = payload.files
  const stagedFiles = payload.stagedFiles
  const unstagedFiles = payload.unstagedFiles
  const error = payload.error

  if (typeof subscriptionId !== 'string' || typeof cwd !== 'string' || !Array.isArray(files)) {
    return null
  }

  return {
    subscriptionId,
    cwd,
    files,
    stagedFiles: Array.isArray(stagedFiles) ? stagedFiles : [],
    unstagedFiles: Array.isArray(unstagedFiles) ? unstagedFiles : [],
    error:
      isRecord(error) && typeof error.message === 'string' && typeof error.code === 'string'
        ? { code: error.code, message: error.message }
        : null,
  }
}

function parseCheckoutCommitResponsePayload(payload: unknown): {
  cwd: string
  success: boolean
  error: { code: string; message: string } | null
  requestId: string
} | null {
  if (!isRecord(payload)) {
    return null
  }

  const cwd = payload.cwd
  const success = payload.success
  const error = payload.error
  const requestId = payload.requestId

  if (typeof cwd !== 'string' || typeof success !== 'boolean' || typeof requestId !== 'string') {
    return null
  }

  return {
    cwd,
    success,
    error:
      isRecord(error) && typeof error.message === 'string' && typeof error.code === 'string'
        ? { code: error.code, message: error.message }
        : null,
    requestId,
  }
}

function sendUnsubscribeRequest(subscriptionId: string | null): void {
  if (!subscriptionId) {
    return
  }

  sendWsMessage({
    type: 'unsubscribe_checkout_diff_request',
    subscriptionId,
  })
}

function subscribeToDiffTarget(target: ThreadDiffTarget): void {
  if (state.connectionStatus !== 'connected') {
    return
  }

  const previousSubscriptionId = state.activeSubscriptionId
  const subscriptionId = randomId('checkout-diff')
  const requestId = randomId('checkout-diff-subscribe')

  sendUnsubscribeRequest(previousSubscriptionId)

  updateState((previous) => ({
    ...previous,
    activeSubscriptionId: subscriptionId,
    activeRequestId: requestId,
    loading: true,
    error: null,
  }))

  sendWsMessage({
    type: 'subscribe_checkout_diff_request',
    subscriptionId,
    cwd: target.cwd,
    compare: {
      mode: 'uncommitted',
    },
    requestId,
    projectId: target.projectId,
    threadId: target.threadId,
  })
}

function toCacheEntry(target: ThreadDiffTarget, payload: CheckoutDiffPayload): DiffCacheEntry {
  return {
    threadKey: target.threadKey,
    projectId: target.projectId,
    threadId: target.threadId,
    cwd: payload.cwd,
    files: payload.files,
    stagedFiles: payload.stagedFiles,
    unstagedFiles: payload.unstagedFiles,
    error: payload.error?.message ?? null,
    updatedAt: new Date().toISOString(),
  }
}

function applyDiffPayload(payload: CheckoutDiffPayload): void {
  updateState((previous) => {
    const activeTarget = previous.activeTarget
    if (!activeTarget || previous.activeSubscriptionId !== payload.subscriptionId) {
      return previous
    }

    const entry = toCacheEntry(activeTarget, payload)

    return {
      ...previous,
      loading: false,
      error: entry.error,
      cacheByThreadKey: {
        ...previous.cacheByThreadKey,
        [activeTarget.threadKey]: entry,
      },
    }
  })
}

function handleDiffSessionMessage(rawMessage: unknown): void {
  if (!isRecord(rawMessage) || typeof rawMessage.type !== 'string') {
    return
  }

  const message = rawMessage as DiffSessionMessage

  switch (message.type) {
    case 'subscribe_checkout_diff_response': {
      const payload = parseCheckoutDiffPayload(message.payload)
      if (!payload) {
        return
      }
      applyDiffPayload(payload)
      return
    }
    case 'checkout_diff_update': {
      const payload = parseCheckoutDiffPayload(message.payload)
      if (!payload) {
        return
      }
      applyDiffPayload(payload)
      return
    }
    case 'checkout_commit_response': {
      const payload = parseCheckoutCommitResponsePayload(message.payload)
      if (!payload) {
        return
      }
      for (const listener of commitResponseListeners) {
        listener(payload)
      }
      return
    }
    case 'checkout_stage_response':
    case 'checkout_unstage_response':
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

  unsubscribeTextMessages = subscribeTextMessages(handleDiffSessionMessage)
  unsubscribeConnectionStatus = subscribeConnectionStatus((nextStatus) => {
    updateState((previous) => ({
      ...previous,
      connectionStatus: nextStatus,
      ...(nextStatus === 'connected'
        ? null
        : {
            activeSubscriptionId: null,
            activeRequestId: null,
          }),
    }))

    if (nextStatus === 'connected' && state.activeTarget) {
      subscribeToDiffTarget(state.activeTarget)
    }
  })
}

export function startDiffStore(): void {
  ensureStarted()
}

export function stopDiffStore(): void {
  if (!started) {
    return
  }

  sendUnsubscribeRequest(state.activeSubscriptionId)
  started = false
  unsubscribeTextMessages?.()
  unsubscribeConnectionStatus?.()
  unsubscribeTextMessages = null
  unsubscribeConnectionStatus = null
}

export function subscribeDiffStore(listener: () => void): () => void {
  return jotaiStore.sub(diffStoreAtom, listener)
}

export function getDiffStoreSnapshot(): DiffStoreState {
  return state
}

export function useDiffStoreSnapshot(): DiffStoreState {
  ensureStarted()
  return useAtomValue(diffStoreAtom)
}

export function getActiveDiffEntry(snapshot = state): DiffCacheEntry | null {
  if (!snapshot.activeTarget) {
    return null
  }
  return snapshot.cacheByThreadKey[snapshot.activeTarget.threadKey] ?? null
}

export function setDiffPanelOpen(isOpen: boolean): void {
  updateState((previous) => ({
    ...previous,
    panel: {
      ...previous.panel,
      isOpen,
    },
  }))
}

export function setDiffPanelWidthPercent(widthPercent: number): void {
  updateState((previous) => ({
    ...previous,
    panel: {
      ...previous.panel,
      widthPercent: clampPanelWidthPercent(widthPercent),
    },
  }))
}

export function setActiveDiffThread(nextTarget: ThreadDiffTarget | null): void {
  ensureStarted()

  const previousTarget = state.activeTarget
  const targetUnchanged = previousTarget?.threadKey === nextTarget?.threadKey && previousTarget?.cwd === nextTarget?.cwd
  if (targetUnchanged) {
    return
  }

  sendUnsubscribeRequest(state.activeSubscriptionId)

  const cached = nextTarget ? state.cacheByThreadKey[nextTarget.threadKey] : null

  updateState((previous) => ({
    ...previous,
    activeTarget: nextTarget,
    activeSubscriptionId: null,
    activeRequestId: null,
    loading: Boolean(nextTarget && previous.connectionStatus === 'connected'),
    error: cached?.error ?? null,
    panel: {
      ...previous.panel,
      isOpen: false,
    },
  }))

  if (nextTarget) {
    subscribeToDiffTarget(nextTarget)
  }
}

export function refreshActiveDiffSnapshot(): void {
  ensureStarted()
  if (!state.activeTarget) {
    return
  }
  subscribeToDiffTarget(state.activeTarget)
}

export function sendStageRequest(cwd: string, filePath: string): void {
  const requestId = randomId('stage')
  sendWsMessage({
    type: 'checkout_stage_request',
    cwd,
    path: filePath,
    requestId,
  })
}

export function sendUnstageRequest(cwd: string, filePath: string): void {
  const requestId = randomId('unstage')
  sendWsMessage({
    type: 'checkout_unstage_request',
    cwd,
    path: filePath,
    requestId,
  })
}

export function sendCommitRequest(cwd: string, message: string): void {
  const requestId = randomId('commit')
  sendWsMessage({
    type: 'checkout_commit_request',
    cwd,
    message,
    addAll: false,
    requestId,
  })
}

export function subscribeCommitResponses(
  listener: (payload: {
    cwd: string
    success: boolean
    error: { code: string; message: string } | null
    requestId: string
  }) => void,
): () => void {
  commitResponseListeners.add(listener)
  return () => {
    commitResponseListeners.delete(listener)
  }
}
