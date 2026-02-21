import type { ConnectionStatus } from '../lib/ws'
import type { ReactElement } from 'react'

type ConnectionOverlayProps = {
  status: ConnectionStatus
}

export function ConnectionOverlay({ status }: ConnectionOverlayProps): ReactElement | null {
  if (status === 'connected') {
    return null
  }

  if (status === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-sm">
        <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 text-sm text-foreground shadow-lg">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
          <span>Connecting to daemon…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-red-950/40 backdrop-blur-sm">
      <div className="rounded-lg border border-red-300/30 bg-red-900/70 p-4 text-sm font-medium text-red-50 shadow-lg">
        Disable input - Reconnecting...
      </div>
    </div>
  )
}
