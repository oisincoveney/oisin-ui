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

type SessionMessage = {
  type: string
  payload?: any
}

type PendingAttach = {
  requestId: string
  terminalId: string
  resumeOffset: number
  forceRefresh: boolean
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

function App() {
  const status = useConnectionStatus()
  const diagnostics = useConnectionDiagnostics()
  const [_, setTerminalId] = useState<string | null>(null)
  const [attachFailureReason, setAttachFailureReason] = useState<string | null>(null)
  const adapterRef = useRef<TerminalStreamAdapter | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const pendingAttachRef = useRef<PendingAttach | null>(null)
  const pendingEnsureRequestIdRef = useRef<string | null>(null)
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
    const requestId = randomId('attach')
    const dimensions = getTerminalDimensions()
    pendingAttachRef.current = {
      requestId,
      terminalId,
      resumeOffset: nextResumeOffset,
      forceRefresh,
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
    if (pendingEnsureRequestIdRef.current) {
      return
    }

    const requestId = randomId('ensure-default')
    setAttachFailureReason(null)
    pendingEnsureRequestIdRef.current = requestId
    sendWsMessage({
      type: 'ensure_default_terminal_request',
      requestId,
    })
  }

  useEffect(() => {
    adapterRef.current?.setTransportConnected(status === 'connected')

    if (status === 'connected') {
      if (hadConnectedOnceRef.current) {
        forceRefreshOnAttachRef.current = true
      }
      hadConnectedOnceRef.current = true
      ensureDefaultTerminal()
      return
    }

    if (status === 'disconnected' || status === 'reconnecting') {
      forceRefreshOnAttachRef.current = hadConnectedOnceRef.current
      pendingEnsureRequestIdRef.current = null
      pendingAttachRef.current = null
      adapterRef.current?.setAttached(false)
      adapterRef.current?.clearPendingInput()
      if (terminalRef.current) {
        terminalRef.current.options.cursorBlink = false
      }
    }
  }, [status])

  useEffect(() => {
    const unsubText = subscribeTextMessages((data) => {
      const msg = data as SessionMessage
      if (msg.type === 'ensure_default_terminal_response') {
        if (msg.payload?.requestId !== pendingEnsureRequestIdRef.current) {
          return
        }
        pendingEnsureRequestIdRef.current = null

        const terminal = msg.payload?.terminal
        if (!terminal?.id) {
          setAttachFailureReason('Daemon did not return a terminal id during ensure')
          return
        }
        terminalIdRef.current = terminal.id
        setTerminalId(terminal.id)
        sendAttachRequest(terminal.id, forceRefreshOnAttachRef.current)
        forceRefreshOnAttachRef.current = false
        return
      }

      if (msg.type !== 'attach_terminal_stream_response') {
        return
      }

      const pendingAttach = pendingAttachRef.current
      if (!pendingAttach || pendingAttach.requestId !== msg.payload?.requestId) {
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

      adapter.setStreamId(msg.payload.streamId)
      adapter.setAttached(true)
      adapter.setOffset(replayedFrom)
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
      ensureDefaultTerminal()
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
    <main className="relative flex h-screen w-screen flex-col bg-background overflow-hidden">
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
          endpoint: diagnostics.endpoint,
          wsFailureReason: diagnostics.lastFailureReason,
          attachFailureReason,
        }}
      />
    </main>
  )
}

export default App
