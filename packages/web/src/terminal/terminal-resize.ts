import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

type UseTerminalResizeOptions = {
  terminal: Terminal | null
  fitAddon: FitAddon | null
  container: HTMLDivElement | null
  onResize?: (cols: number, rows: number) => void
}

export function useTerminalResize({ terminal, fitAddon, container, onResize }: UseTerminalResizeOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCols = useRef<number>(-1)
  const lastRows = useRef<number>(-1)

  useEffect(() => {
    if (!terminal || !fitAddon || !container) {
      return
    }

    const scheduleResize = (cols: number, rows: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      if (cols === lastCols.current && rows === lastRows.current) {
        return
      }

      timeoutRef.current = setTimeout(() => {
        onResize?.(cols, rows)
        lastCols.current = cols
        lastRows.current = rows
        timeoutRef.current = null
      }, 200)
    }

    const fitAndSchedule = () => {
      fitAddon.fit()
      scheduleResize(terminal.cols, terminal.rows)
    }

    const disposable = terminal.onResize(({ cols, rows }) => {
      scheduleResize(cols, rows)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAndSchedule()
    })
    resizeObserver.observe(container)

    fitAndSchedule()

    return () => {
      disposable.dispose()
      resizeObserver.disconnect()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [terminal, fitAddon, container, onResize])
}
