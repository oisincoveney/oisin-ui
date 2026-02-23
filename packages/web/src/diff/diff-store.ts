import { useSyncExternalStore } from 'react'
import {
  getConnectionStatus,
  sendWsMessage,
  subscribeConnectionStatus,
  subscribeTextMessages,
} from '@/lib/ws'
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

const listeners = new Set<() => void>()

let started = false
let unsubscribeTextMessages: (() => void) | null = null
let unsubscribeConnectionStatus: (() => void) | null = null

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

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setState(nextState: DiffStoreState): void {
  state = nextState
  notify()
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
  const error = payload.error

  if (typeof subscriptionId !== 'string' || typeof cwd !== 'string' || !Array.isArray(files)) {
    return null
  }

  return {
    subscriptionId,
    cwd,
    files,
    error: isRecord(error) && typeof error.message === 'string' && typeof error.code === 'string' ? { code: error.code, message: error.message } : null,
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
  })
}

function toCacheEntry(target: ThreadDiffTarget, payload: CheckoutDiffPayload): DiffCacheEntry {
  return {
    threadKey: target.threadKey,
    projectId: target.projectId,
    threadId: target.threadId,
    cwd: payload.cwd,
    files: payload.files,
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
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDiffStoreSnapshot(): DiffStoreState {
  return state
}

export function useDiffStoreSnapshot(): DiffStoreState {
  ensureStarted()
  return useSyncExternalStore(subscribeDiffStore, getDiffStoreSnapshot, getDiffStoreSnapshot)
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
  const targetUnchanged =
    previousTarget?.threadKey === nextTarget?.threadKey && previousTarget?.cwd === nextTarget?.cwd
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
