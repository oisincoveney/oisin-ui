import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { ConnectionOverlay } from './components/ConnectionOverlay'
import {
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
  getActiveThread,
  switchRelativeThread,
  useThreadStoreSnapshot,
} from './thread/thread-store'

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

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

function App() {
  const status = useConnectionStatus()
  const diagnostics = useConnectionDiagnostics()
  const threadSnapshot = useThreadStoreSnapshot()
  const activeThread = getActiveThread(threadSnapshot)
  const activeThreadTerminalId = activeThread?.terminalId ?? null
  const [_, setTerminalId] = useState<string | null>(null)
  const [attachFailureReason, setAttachFailureReason] = useState<string | null>(null)
  const adapterRef = useRef<TerminalStreamAdapter | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const pendingAttachRef = useRef<PendingAttach | null>(null)
  const pendingEnsureRef = useRef<PendingEnsure | null>(null)
  const statusRef = useRef(status)
  const attachCycleRef = useRef(0)
  const hadConnectedOnceRef = useRef(false)
  const forceRefreshOnAttachRef = useRef(false)
  const pendingScrollToBottomRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingScroll = () => {
    if (pendingScrollToBottomRef.current !== null) {
      clearTimeout(pendingScrollToBottomRef.current)
      pendingScrollToBottomRef.current = null
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
    setAttachFailureReason(null)
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
    statusRef.current = status
    adapterRef.current?.setTransportConnected(status === 'connected')

    if (status === 'connected') {
      if (hadConnectedOnceRef.current) {
        forceRefreshOnAttachRef.current = true
      }
      hadConnectedOnceRef.current = true

      if (terminalRef.current && activeThreadTerminalId) {
        const forceRefresh = forceRefreshOnAttachRef.current
        terminalIdRef.current = activeThreadTerminalId
        setTerminalId(activeThreadTerminalId)
        sendAttachRequest(activeThreadTerminalId, forceRefresh)
        forceRefreshOnAttachRef.current = false
      } else {
        ensureDefaultTerminal()
      }
      return
    }

    if (status === 'disconnected' || status === 'reconnecting') {
      attachCycleRef.current += 1
      forceRefreshOnAttachRef.current = hadConnectedOnceRef.current
      pendingEnsureRef.current = null
      pendingAttachRef.current = null
      adapterRef.current?.resetForStreamRollover()
      if (terminalRef.current) {
        terminalRef.current.options.cursorBlink = false
      }
    }
  }, [status, activeThreadTerminalId])

  useEffect(() => {
    if (status !== 'connected') {
      return
    }

    if (!terminalRef.current || !activeThreadTerminalId) {
      return
    }

    if (terminalIdRef.current === activeThreadTerminalId && !pendingAttachRef.current) {
      clearUnreadForActiveThread()
      return
    }

    pendingEnsureRef.current = null
    terminalIdRef.current = activeThreadTerminalId
    setTerminalId(activeThreadTerminalId)
    clearUnreadForActiveThread()
    sendAttachRequest(activeThreadTerminalId, false)
    scheduleScrollToBottom()
  }, [status, activeThreadTerminalId])

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
        setAttachFailureReason(attachError)
        console.error('[terminal] attach failed', msg.payload?.error)
        return
      }

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
      } else {
        ensureDefaultTerminal()
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

  return (
    <main className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden relative">
        <TerminalView
          onTerminalReady={handleTerminalReady}
          onResize={handleResize}
          className="w-full h-full"
        />
      </div>
      <ConnectionOverlay
        status={status}
        diagnostics={{
          wsUrl: diagnostics.wsUrl,
          endpoint: diagnostics.endpoint,
          wsFailureReason: diagnostics.lastFailureReason,
          wsFailureHint: diagnostics.lastFailureHint,
          attachFailureReason,
        }}
      />
    </main>
  )
}

export default App
