import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { ConnectionOverlay } from './components/ConnectionOverlay'
import { 
  useConnectionStatus, 
  sendWsMessage, 
  sendWsBinary, 
  subscribeTextMessages, 
  subscribeBinaryMessages 
} from './lib/ws'
import { TerminalView } from './terminal/terminal-view'
import { TerminalStreamAdapter } from './terminal/terminal-stream'
import { decodeBinaryMuxFrame } from './terminal/binary-mux'

function App() {
  const status = useConnectionStatus()
  const [_, setTerminalId] = useState<string | null>(null)
  const adapterRef = useRef<TerminalStreamAdapter | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  
  useEffect(() => {
    if (status !== 'connected') {
      if (adapterRef.current) {
        adapterRef.current.setAttached(false)
      }
      return
    }

    const unsubText = subscribeTextMessages((msg: any) => {
      if (msg.type === 'ensure_default_terminal_response' && msg.terminal?.id) {
        setTerminalId(msg.terminal.id)
        
        const attachReqId = Math.random().toString(36).slice(2)
        sendWsMessage({
          type: 'attach_terminal_stream_request',
          terminalId: msg.terminal.id,
          requestId: attachReqId,
          resumeOffset: adapterRef.current?.getOffset() ?? 0,
        })
      } else if (msg.type === 'attach_terminal_stream_response') {
        if (msg.streamId !== undefined && adapterRef.current) {
          adapterRef.current.streamId = msg.streamId
          adapterRef.current.setAttached(true)
          if (msg.replayedFrom !== undefined && msg.reset) {
            adapterRef.current.setOffset(msg.replayedFrom)
          }
        }
      }
    })

    const unsubBin = subscribeBinaryMessages((data: Uint8Array) => {
      const frame = decodeBinaryMuxFrame(data)
      if (frame && adapterRef.current) {
        adapterRef.current.handleFrame(frame)
      }
    })

    sendWsMessage({
      type: 'ensure_default_terminal_request',
      requestId: Math.random().toString(36).slice(2)
    })

    return () => {
      unsubText()
      unsubBin()
    }
  }, [status])

  const handleTerminalReady = (term: Terminal) => {
    terminalRef.current = term
    adapterRef.current = new TerminalStreamAdapter(term, 0, sendWsBinary)
    
    term.onData((data) => {
      adapterRef.current?.sendInput(data)
    })
  }

  return (
    <main className="relative flex h-screen w-screen flex-col bg-background overflow-hidden">
      <div className="flex-1 overflow-hidden relative">
        <TerminalView 
          onTerminalReady={handleTerminalReady} 
          className="w-full h-full"
        />
      </div>
      <ConnectionOverlay status={status} />
    </main>
  )
}

export default App
