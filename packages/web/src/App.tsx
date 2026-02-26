import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { PanelRightOpen, RefreshCw } from 'lucide-react'
import type { PanelSize } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { ConnectionOverlay } from './components/ConnectionOverlay'
import { DiffMobileSheet } from './components/diff-mobile-sheet'
import { DiffPanel } from './components/diff-panel'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable'
import { useIsMobile } from './hooks/use-mobile'
import {
  getActiveDiffEntry,
  refreshActiveDiffSnapshot,
  setDiffPanelOpen,
  setDiffPanelWidthPercent,
  useDiffStoreSnapshot,
} from './diff/diff-store'
import {
  type ConnectionStatus,
  getServerInfoFromSessionMessage,
  useConnectionDiagnostics,
  useConnectionStatus,
  sendWsMessage,
  sendWsBinary,
  subscribeTextMessages,
  subscribeBinaryMessages,
} from './lib/ws'
import { TerminalView } from './terminal/terminal-view'
import { TerminalStreamAdapter } from './terminal/terminal-stream'
import { decodeBinaryMuxFrame } from './terminal/binary-mux'
import {
  clearUnreadForActiveThread,
  clearRuntimeRecoveryToast,
  dismissThreadToast,
  getActiveThread,
  markRuntimeWarmupAttachSettled,
  noteDaemonServerId,
  switchRelativeThread,
  useThreadStoreSnapshot,
} from './thread/thread-store'
import { toast } from 'sonner'

type SessionMessage = {
  type: string
  payload?: any
}

type PendingAttach = {
  requestId: string
  terminalId: string
  resumeOffset: number
  forceRefresh: boolean
  cycleId: number
}

type PendingEnsure = {
  requestId: string
  cycleId: number
}

export const ATTACH_RECOVERY_WINDOW_MS = 60_000
const ATTACH_RECOVERY_BASE_DELAY_MS = 500
const ATTACH_RECOVERY_MAX_DELAY_MS = 5_000
const ATTACH_RECOVERY_MAX_ATTEMPTS = 40

export type AttachRecoveryPhase = 'idle' | 'retrying' | 'failed'

export type AttachRecoveryState = {
  phase: AttachRecoveryPhase
  startedAt: number | null
  deadlineAt: number | null
  attempt: number
  lastError: string | null
  token: number
}

export function createIdleAttachRecoveryState(token = 0): AttachRecoveryState {
  return {
    phase: 'idle',
    startedAt: null,
    deadlineAt: null,
    attempt: 0,
    lastError: null,
    token,
  }
}

export function getAttachRecoveryRetryDelayMs(attempt: number): number {
  if (attempt <= 1) {
    return ATTACH_RECOVERY_BASE_DELAY_MS
  }
  return Math.min(ATTACH_RECOVERY_BASE_DELAY_MS * 2 ** (attempt - 1), ATTACH_RECOVERY_MAX_DELAY_MS)
}

export function getAttachRecoveryRemainingMs(state: AttachRecoveryState, now: number): number | null {
  if (state.phase !== 'retrying' || state.deadlineAt === null) {
    return null
  }
  return Math.max(0, state.deadlineAt - now)
}

export function nextAttachRecoveryRetryState(
  current: AttachRecoveryState,
  now: number,
  error: string
): AttachRecoveryState {
  const starting = current.phase !== 'retrying'
  const startedAt = starting ? now : (current.startedAt ?? now)
  const deadlineAt = starting ? now + ATTACH_RECOVERY_WINDOW_MS : (current.deadlineAt ?? now + ATTACH_RECOVERY_WINDOW_MS)
  const attempt = starting ? 1 : current.attempt + 1
  const token = starting ? current.token + 1 : current.token

  if (now >= deadlineAt || attempt > ATTACH_RECOVERY_MAX_ATTEMPTS) {
    return {
      phase: 'failed',
      startedAt,
      deadlineAt,
      attempt,
      lastError: error,
      token,
    }
  }

  return {
    phase: 'retrying',
    startedAt,
    deadlineAt,
    attempt,
    lastError: error,
    token,
  }
}

export function resolveAttachRecoverySuccess(
  current: AttachRecoveryState,
  lastToastToken: number | null
): {
  nextState: AttachRecoveryState
  emitToast: boolean
  nextToastToken: number | null
} {
  if (current.phase === 'idle') {
    return {
      nextState: current,
      emitToast: false,
      nextToastToken: lastToastToken,
    }
  }

  const emitToast = current.token > 0 && current.token !== lastToastToken
  return {
    nextState: createIdleAttachRecoveryState(current.token),
    emitToast,
    nextToastToken: emitToast ? current.token : lastToastToken,
  }
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

function getConnectionBadge(status: ConnectionStatus): {
  label: string
  className: string
  dotClassName: string
} {
  if (status === 'connected') {
    return {
      label: 'Connected',
      className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      dotClassName: 'bg-emerald-400',
    }
  }

  if (status === 'connecting') {
    return {
      label: 'Connecting',
      className: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
    }
  }

  if (status === 'reconnecting') {
    return {
      label: 'Reconnecting',
      className: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
    }
  }

  return {
    label: 'Disconnected',
    className: 'border-red-500/35 bg-red-500/10 text-red-300',
    dotClassName: 'bg-red-400',
  }
}

function App() {
  const status = useConnectionStatus()
  const connectionBadge = getConnectionBadge(status)
  const diagnostics = useConnectionDiagnostics()
  const threadSnapshot = useThreadStoreSnapshot()
  const diffSnapshot = useDiffStoreSnapshot()
  const isMobile = useIsMobile()
  const activeThread = getActiveThread(threadSnapshot)
  const activeThreadTerminalId =
    activeThread && activeThread.status !== 'closed' && activeThread.status !== 'error'
      ? (activeThread.terminalId ?? null)
      : null
  const activeDiffEntry = getActiveDiffEntry(diffSnapshot)
  const diffFiles = activeDiffEntry?.files ?? []
  const diffPanelOpen = diffSnapshot.panel.isOpen
  const diffPanelWidth = diffSnapshot.panel.widthPercent
  const previousActiveThreadKeyRef = useRef<string | null>(threadSnapshot.activeThreadKey)
  const [_, setTerminalId] = useState<string | null>(null)
  const [attachFailureReason, setAttachFailureReason] = useState<string | null>(null)
  const [attachRecovery, setAttachRecovery] = useState<AttachRecoveryState>(() => createIdleAttachRecoveryState())
  const [attachRecoveryNow, setAttachRecoveryNow] = useState(() => Date.now())
  const adapterRef = useRef<TerminalStreamAdapter | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const activeThreadTerminalIdRef = useRef<string | null>(activeThreadTerminalId)
  const pendingAttachRef = useRef<PendingAttach | null>(null)
  const pendingEnsureRef = useRef<PendingEnsure | null>(null)
  const statusRef = useRef(status)
  const attachCycleRef = useRef(0)
  const attachRecoveryRef = useRef<AttachRecoveryState>(createIdleAttachRecoveryState())
  const attachRecoveryRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attachRecoveryToastTokenRef = useRef<number | null>(null)
  const hadConnectedOnceRef = useRef(false)
  const runtimeWarmupActiveRef = useRef(threadSnapshot.runtimeRecovery.warmup.active)
  const forceRefreshOnAttachRef = useRef(false)
  const pendingScrollToBottomRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelWidthStorageKey = 'paseo.diff-panel.width-percent'

  const clearPendingScroll = () => {
    if (pendingScrollToBottomRef.current !== null) {
      clearTimeout(pendingScrollToBottomRef.current)
      pendingScrollToBottomRef.current = null
    }
  }

  const clearAttachRecoveryRetryTimer = () => {
    if (attachRecoveryRetryTimerRef.current !== null) {
      clearTimeout(attachRecoveryRetryTimerRef.current)
      attachRecoveryRetryTimerRef.current = null
    }
  }

  const setAttachRecoveryState = (next: AttachRecoveryState) => {
    attachRecoveryRef.current = next
    setAttachRecovery(next)
  }

  const resetAttachRecovery = () => {
    clearAttachRecoveryRetryTimer()
    const next = createIdleAttachRecoveryState(attachRecoveryRef.current.token)
    setAttachRecoveryState(next)
    setAttachRecoveryNow(Date.now())
  }

  const failAttachRecovery = (next: AttachRecoveryState) => {
    clearAttachRecoveryRetryTimer()
    setAttachRecoveryState(next)
    setAttachRecoveryNow(Date.now())
    markRuntimeWarmupAttachSettled()
    setAttachFailureReason(
      `Attach recovery timed out after 60s. Last error: ${next.lastError ?? 'attach failed'}. Try switching threads or restarting the daemon.`
    )
  }

  const scheduleAttachRecoveryRetry = (next: AttachRecoveryState, terminalId: string) => {
    if (next.phase !== 'retrying') {
      failAttachRecovery(next)
      return
    }

    const remainingMs = getAttachRecoveryRemainingMs(next, Date.now())
    if (remainingMs === null || remainingMs <= 0) {
      failAttachRecovery({ ...next, phase: 'failed' })
      return
    }

    clearAttachRecoveryRetryTimer()
    const retryDelayMs = Math.min(getAttachRecoveryRetryDelayMs(next.attempt), remainingMs)
    attachRecoveryRetryTimerRef.current = setTimeout(() => {
      attachRecoveryRetryTimerRef.current = null

      if (statusRef.current !== 'connected') {
        return
      }

      const currentRecovery = attachRecoveryRef.current
      if (currentRecovery.phase !== 'retrying') {
        return
      }

      const now = Date.now()
      const windowRemainingMs = getAttachRecoveryRemainingMs(currentRecovery, now)
      if (windowRemainingMs === null || windowRemainingMs <= 0) {
        failAttachRecovery({ ...currentRecovery, phase: 'failed' })
        return
      }

      const targetTerminalId = activeThreadTerminalIdRef.current ?? terminalIdRef.current ?? terminalId
      if (!targetTerminalId) {
        failAttachRecovery({
          ...currentRecovery,
          phase: 'failed',
          lastError: 'No active terminal id available during attach recovery',
        })
        return
      }

      terminalIdRef.current = targetTerminalId
      setTerminalId(targetTerminalId)
      sendAttachRequest(targetTerminalId, true)
    }, retryDelayMs)
  }

  const toggleDiffPanel = () => {
    const nextOpen = !diffPanelOpen
    setDiffPanelOpen(nextOpen)

    if (nextOpen) {
      setTimeout(() => {
        terminalRef.current?.focus()
      }, 0)
    }
  }

  const scheduleScrollToBottom = () => {
    clearPendingScroll()
    pendingScrollToBottomRef.current = setTimeout(() => {
      pendingScrollToBottomRef.current = null
      terminalRef.current?.scrollToBottom()
    }, 250)
  }

  const getTerminalDimensions = () => {
    const term = terminalRef.current
    if (!term || term.rows <= 0 || term.cols <= 0) {
      return undefined
    }
    return {
      rows: term.rows,
      cols: term.cols,
    }
  }

  const sendAttachRequest = (terminalId: string, forceRefresh: boolean) => {
    // If there's already a pending attach request, don't send another.
    // This prevents retry amplification where multiple callers each send
    // a request before the previous response arrives.
    if (pendingAttachRef.current) {
      return
    }

    const nextResumeOffset = forceRefresh ? 0 : (adapterRef.current?.getOffset() ?? 0)
    adapterRef.current?.resetForStreamRollover({ resetOffset: forceRefresh })
    const requestId = randomId('attach')
    const dimensions = getTerminalDimensions()
    pendingAttachRef.current = {
      requestId,
      terminalId,
      resumeOffset: nextResumeOffset,
      forceRefresh,
      cycleId: attachCycleRef.current,
    }

    if (forceRefresh) {
      terminalRef.current?.clear()
      adapterRef.current?.setOffset(0)
      console.info('[terminal] reconnect refresh requested from server')
    }

    sendWsMessage({
      type: 'attach_terminal_stream_request',
      terminalId,
      requestId,
      resumeOffset: nextResumeOffset,
      rows: dimensions?.rows,
      cols: dimensions?.cols,
    })
  }

  const ensureDefaultTerminal = () => {
    if (status !== 'connected' || !terminalRef.current) {
      return
    }
    if (pendingEnsureRef.current) {
      return
    }

    const requestId = randomId('ensure-default')
    setAttachFailureReason(null)
    pendingEnsureRef.current = {
      requestId,
      cycleId: attachCycleRef.current,
    }
    sendWsMessage({
      type: 'ensure_default_terminal_request',
      requestId,
    })
  }

  useEffect(() => {
    activeThreadTerminalIdRef.current = activeThreadTerminalId
  }, [activeThreadTerminalId])

  useEffect(() => {
    attachRecoveryRef.current = attachRecovery
  }, [attachRecovery])

  useEffect(() => {
    runtimeWarmupActiveRef.current = threadSnapshot.runtimeRecovery.warmup.active
  }, [threadSnapshot.runtimeRecovery.warmup.active])

  useEffect(() => {
    if (attachRecovery.phase !== 'retrying') {
      return
    }

    setAttachRecoveryNow(Date.now())
    const timer = setInterval(() => {
      setAttachRecoveryNow(Date.now())
    }, 1_000)

    return () => {
      clearInterval(timer)
    }
  }, [attachRecovery.phase])

  useEffect(() => {
    statusRef.current = status
    adapterRef.current?.setTransportConnected(status === 'connected')

    if (status === 'connected') {
      if (hadConnectedOnceRef.current) {
        forceRefreshOnAttachRef.current = true
      }
      hadConnectedOnceRef.current = true

      // Don't send a fresh attach if recovery is already retrying — the
      // recovery timer owns the retry cadence.  Sending here would bypass
      // the exponential backoff and cause a burst of duplicate requests.
      if (attachRecoveryRef.current.phase === 'retrying') {
        return
      }

      if (terminalRef.current && activeThreadTerminalId) {
        const forceRefresh = forceRefreshOnAttachRef.current
        terminalIdRef.current = activeThreadTerminalId
        setTerminalId(activeThreadTerminalId)
        sendAttachRequest(activeThreadTerminalId, forceRefresh)
        forceRefreshOnAttachRef.current = false
      } else if (activeThreadTerminalId) {
        ensureDefaultTerminal()
      }
      return
    }

    if (status === 'disconnected' || status === 'reconnecting') {
      clearAttachRecoveryRetryTimer()
      attachCycleRef.current += 1
      forceRefreshOnAttachRef.current = hadConnectedOnceRef.current
      pendingEnsureRef.current = null
      pendingAttachRef.current = null
      setAttachRecoveryState(createIdleAttachRecoveryState(attachRecoveryRef.current.token))
      adapterRef.current?.resetForStreamRollover()
      if (terminalRef.current) {
        terminalRef.current.options.cursorBlink = false
      }
    }
  }, [status, activeThreadTerminalId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedWidth = window.localStorage.getItem(panelWidthStorageKey)
    if (!storedWidth) {
      return
    }

    const parsedWidth = Number.parseFloat(storedWidth)
    if (Number.isFinite(parsedWidth)) {
      setDiffPanelWidthPercent(parsedWidth)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(panelWidthStorageKey, String(diffPanelWidth))
  }, [diffPanelWidth])

  useEffect(() => {
    const previousThreadKey = previousActiveThreadKeyRef.current
    const nextThreadKey = threadSnapshot.activeThreadKey

    if (previousThreadKey !== null && previousThreadKey !== nextThreadKey) {
      setDiffPanelOpen(false)
    }

    previousActiveThreadKeyRef.current = nextThreadKey
  }, [threadSnapshot.activeThreadKey])

  useEffect(() => {
    if (threadSnapshot.toasts.length === 0) {
      return
    }

    for (const threadToast of threadSnapshot.toasts) {
      toast(threadToast.threadTitle, {
        id: threadToast.id,
        description: threadToast.message,
        duration: 5000,
      })
      dismissThreadToast(threadToast.id)
    }
  }, [threadSnapshot.toasts])

  useEffect(() => {
    if (!threadSnapshot.runtimeRecovery.reconnectedToastPending) {
      return
    }

    toast.success('Reconnected')
    clearRuntimeRecoveryToast()
  }, [threadSnapshot.runtimeRecovery.reconnectedToastPending])

  useEffect(() => {
    if (status !== 'connected') {
      return
    }

    if (!terminalRef.current) {
      return
    }

    if (!activeThreadTerminalId) {
      const activeThreadCleared = threadSnapshot.activeThreadKey === null
      if (activeThreadCleared) {
        attachCycleRef.current += 1
      }
      markRuntimeWarmupAttachSettled()
      resetAttachRecovery()
      pendingEnsureRef.current = null
      pendingAttachRef.current = null
      forceRefreshOnAttachRef.current = false
      terminalIdRef.current = null
      setTerminalId(null)
      setAttachFailureReason(null)
      adapterRef.current?.resetForStreamRollover({ resetOffset: true })
      terminalRef.current.clear()
      terminalRef.current.options.cursorBlink = false
      return
    }

    if (terminalIdRef.current === activeThreadTerminalId && !pendingAttachRef.current) {
      clearUnreadForActiveThread()
      return
    }

    // If recovery is actively retrying for the same terminal, don't reset
    // it and send a duplicate attach — that would bypass the backoff timer.
    if (
      attachRecoveryRef.current.phase === 'retrying' &&
      terminalIdRef.current === activeThreadTerminalId
    ) {
      clearUnreadForActiveThread()
      return
    }

    pendingEnsureRef.current = null
    resetAttachRecovery()
    terminalIdRef.current = activeThreadTerminalId
    setTerminalId(activeThreadTerminalId)
    clearUnreadForActiveThread()
    sendAttachRequest(activeThreadTerminalId, false)
    scheduleScrollToBottom()
  }, [status, activeThreadTerminalId, threadSnapshot.activeThreadKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) {
        return
      }

      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        switchRelativeThread(-1)
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        switchRelativeThread(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    const unsubText = subscribeTextMessages((data) => {
      const msg = data as SessionMessage

      const serverInfo = getServerInfoFromSessionMessage(msg)
      if (serverInfo) {
        noteDaemonServerId(serverInfo.serverId)
      }

      if (msg.type === 'terminal_stream_exit') {
        const terminalId = msg.payload?.terminalId
        const streamId = msg.payload?.streamId
        const adapter = adapterRef.current

        if (!terminalId || terminalId !== terminalIdRef.current || !adapter) {
          return
        }

        if (typeof streamId === 'number' && streamId !== adapter.streamId) {
          return
        }

        adapter.resetForStreamRollover()

        const currentActiveThread = getActiveThread()
        if (
          !currentActiveThread?.terminalId ||
          currentActiveThread.terminalId !== terminalId ||
          currentActiveThread.status === 'closed' ||
          currentActiveThread.status === 'error'
        ) {
          return
        }

        if (statusRef.current !== 'connected' || pendingAttachRef.current) {
          return
        }

        setAttachFailureReason('Terminal stream ended; reattaching…')
        sendAttachRequest(terminalId, true)
        return
      }

      if (msg.type === 'ensure_default_terminal_response') {
        const pendingEnsure = pendingEnsureRef.current
        if (
          !pendingEnsure ||
          msg.payload?.requestId !== pendingEnsure.requestId ||
          pendingEnsure.cycleId !== attachCycleRef.current
        ) {
          return
        }
        pendingEnsureRef.current = null

        const terminal = msg.payload?.terminal
        if (!terminal?.id) {
          markRuntimeWarmupAttachSettled()
          setAttachFailureReason('Daemon did not return a terminal id during ensure')
          return
        }
        const storeActiveThread = getActiveThread()
        const targetTerminalId = storeActiveThread?.terminalId ?? terminal.id
        terminalIdRef.current = targetTerminalId
        setTerminalId(targetTerminalId)
        sendAttachRequest(targetTerminalId, forceRefreshOnAttachRef.current)
        forceRefreshOnAttachRef.current = false
        return
      }

      if (msg.type !== 'attach_terminal_stream_response') {
        return
      }

      const pendingAttach = pendingAttachRef.current
      if (
        !pendingAttach ||
        pendingAttach.requestId !== msg.payload?.requestId ||
        pendingAttach.cycleId !== attachCycleRef.current
      ) {
        return
      }
      pendingAttachRef.current = null

      if (msg.payload?.error || typeof msg.payload?.streamId !== 'number') {
        const attachError =
          typeof msg.payload?.error === 'string' && msg.payload.error.length > 0
            ? msg.payload.error
            : 'attach_terminal_stream_response missing streamId'

        const now = Date.now()
        const nextRecovery = nextAttachRecoveryRetryState(attachRecoveryRef.current, now, attachError)
        setAttachRecoveryState(nextRecovery)
        setAttachRecoveryNow(now)
        setAttachFailureReason(attachError)
        scheduleAttachRecoveryRetry(nextRecovery, pendingAttach.terminalId)
        console.error('[terminal] attach failed', msg.payload?.error)
        return
      }

      markRuntimeWarmupAttachSettled()

      const recoveryResolution = resolveAttachRecoverySuccess(
        attachRecoveryRef.current,
        attachRecoveryToastTokenRef.current
      )
      setAttachRecoveryState(recoveryResolution.nextState)
      attachRecoveryToastTokenRef.current = recoveryResolution.nextToastToken
      if (recoveryResolution.emitToast && !runtimeWarmupActiveRef.current) {
        toast.success('Reconnected')
      }
      clearAttachRecoveryRetryTimer()
      setAttachFailureReason(null)

      const adapter = adapterRef.current
      if (!adapter) {
        return
      }

      const responseReset = Boolean(msg.payload?.reset)
      const replayedFrom = Number(msg.payload?.replayedFrom ?? 0)
      const hasOffsetGap = replayedFrom > pendingAttach.resumeOffset

      if ((responseReset || hasOffsetGap) && !pendingAttach.forceRefresh) {
        console.warn('[terminal] resume offset stale, forcing full redraw from server')
        sendAttachRequest(pendingAttach.terminalId, true)
        return
      }

      adapter.confirmAttachedStream(msg.payload.streamId, { offset: replayedFrom })
      if (terminalRef.current) {
        terminalRef.current.options.cursorBlink = true
      }

      if (pendingAttach.forceRefresh || responseReset || hasOffsetGap) {
        scheduleScrollToBottom()
      }
    })

    const unsubBin = subscribeBinaryMessages((data: Uint8Array) => {
      const frame = decodeBinaryMuxFrame(data)
      if (frame && adapterRef.current) {
        adapterRef.current.handleFrame(frame)
      }
    })

    return () => {
      unsubText()
      unsubBin()
      clearAttachRecoveryRetryTimer()
      clearPendingScroll()
    }
  }, [])

  const handleTerminalReady = (term: Terminal) => {
    terminalRef.current = term
    adapterRef.current = new TerminalStreamAdapter(term, 0, sendWsBinary, {
      onChunkApplied: (chunk) => {
        if (!chunk.replay && pendingScrollToBottomRef.current !== null) {
          scheduleScrollToBottom()
        }
      },
    })
    adapterRef.current.setTransportConnected(status === 'connected')

    term.onData((data) => {
      adapterRef.current?.sendInput(data)
    })

    if (status === 'connected') {
      if (activeThreadTerminalId) {
        terminalIdRef.current = activeThreadTerminalId
        setTerminalId(activeThreadTerminalId)
        sendAttachRequest(activeThreadTerminalId, false)
      }
    }
  }

  const handleResize = (cols: number, rows: number) => {
    const terminalId = terminalIdRef.current
    if (status !== 'connected' || !terminalId) {
      return
    }

    sendWsMessage({
      type: 'terminal_input',
      terminalId,
      message: {
        type: 'resize',
        cols,
        rows,
      },
    })
  }

  const attachRecoveryRemainingMs = getAttachRecoveryRemainingMs(attachRecovery, attachRecoveryNow)

  return (
    <main className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{activeThread?.title ?? 'Terminal'}</p>
          <p className="text-xs text-muted-foreground">{activeThread?.projectId ?? 'No active thread'}</p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${connectionBadge.className}`}
            aria-live="polite"
            title={`Daemon websocket status: ${connectionBadge.label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connectionBadge.dotClassName}`} aria-hidden="true" />
            <span>{connectionBadge.label}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              refreshActiveDiffSnapshot()
            }}
            disabled={!diffSnapshot.activeTarget}
            aria-label="Refresh diff"
            title="Refresh diff"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={diffPanelOpen ? 'secondary' : 'ghost'}
            size="icon"
            onClick={toggleDiffPanel}
            disabled={!diffSnapshot.activeTarget}
            aria-label={diffPanelOpen ? 'Close diff panel' : 'Open diff panel'}
            title={diffPanelOpen ? 'Close diff panel' : 'Open diff panel'}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!isMobile && diffPanelOpen ? (
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel defaultSize={100 - diffPanelWidth} minSize={40}>
              <TerminalView
                onTerminalReady={handleTerminalReady}
                onResize={handleResize}
                className="h-full w-full"
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={diffPanelWidth}
              minSize={30}
              maxSize={60}
              onResize={(size: PanelSize) => {
                setDiffPanelWidthPercent(size.asPercentage)
              }}
            >
              <DiffPanel
                files={diffFiles}
                loading={diffSnapshot.loading}
                error={diffSnapshot.error}
                onClose={() => {
                  setDiffPanelOpen(false)
                }}
                onRefresh={() => {
                  refreshActiveDiffSnapshot()
                }}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <TerminalView
            onTerminalReady={handleTerminalReady}
            onResize={handleResize}
            className="h-full w-full"
          />
        )}
      </div>

      <DiffMobileSheet
        open={isMobile && diffPanelOpen}
        onOpenChange={(open) => {
          setDiffPanelOpen(open)
          if (!open) {
            setTimeout(() => {
              terminalRef.current?.focus()
            }, 0)
          }
        }}
        files={diffFiles}
        loading={diffSnapshot.loading}
        error={diffSnapshot.error}
        onRefresh={() => {
          refreshActiveDiffSnapshot()
        }}
      />

      <ConnectionOverlay
        status={status}
        diagnostics={{
          wsUrl: diagnostics.wsUrl,
          endpoint: diagnostics.endpoint,
          wsFailureReason: diagnostics.lastFailureReason,
          wsFailureHint: diagnostics.lastFailureHint,
          attachFailureReason,
          attachRecovery: {
            phase: attachRecovery.phase,
            attempt: attachRecovery.attempt,
            deadlineAt: attachRecovery.deadlineAt,
            remainingMs: attachRecoveryRemainingMs,
            lastError: attachRecovery.lastError,
          },
        }}
      />
    </main>
  )
}

export default App
