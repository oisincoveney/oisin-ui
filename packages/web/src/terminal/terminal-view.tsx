import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useTerminalResize } from './terminal-resize'

export interface TerminalViewProps {
  onTerminalReady?: (terminal: Terminal) => void
  onDispose?: () => void
  onResize?: (cols: number, rows: number) => void
  className?: string
}

export function TerminalView({ onTerminalReady, onDispose, onResize, className = '' }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [terminalState, setTerminalState] = useState<Terminal | null>(null)

  useTerminalResize({
    terminal: terminalState,
    fitAddon: fitAddonRef.current,
    container: containerRef.current,
    onResize,
  })

  useEffect(() => {
    if (!containerRef.current) {return}

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: 'hsl(227, 33%, 12%)',
        foreground: 'hsl(220, 14%, 95%)',
        cursor: 'hsl(220, 14%, 95%)',
        cursorAccent: 'hsl(227, 33%, 12%)',
        selectionBackground: 'hsla(220, 14%, 95%, 0.3)',
      },
      allowTransparency: true,
      scrollback: 10000,
    })

    terminalRef.current = term
    setTerminalState(term)

    // Load addons
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)

    let webglAddon: WebglAddon | null = null
    try {
      webglAddon = new WebglAddon()
      // Only load webgl when terminal is opened, otherwise it crashes
    } catch {
      // WebGL not supported — fall back to canvas renderer
    }

    // Mount to DOM
    term.open(containerRef.current)

    if (webglAddon) {
      try {
        term.loadAddon(webglAddon)
      } catch {
        // WebGL addon failed to load — terminal still functional without it
      }
    }

    // Use a small timeout to ensure DOM is ready and sized.
    setTimeout(() => {
      try {
        fitAddon.fit()
        if (onTerminalReady) {
          onTerminalReady(term)
        }
      } catch  {
        // ignore fit errors during fast unmount
      }
    }, 10)

    return () => {
      if (onDispose) {
        onDispose()
      }
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      setTerminalState(null)
    }
  }, [onTerminalReady, onDispose])

  return <div ref={containerRef} className={`w-full h-full overflow-hidden ${className}`} style={{ padding: '8px' }} />
}
