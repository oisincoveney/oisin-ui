import type { ConnectionStatus } from '../lib/ws'
import type { ReactElement } from 'react'

type ConnectionOverlayProps = {
  status: ConnectionStatus
}

export function ConnectionOverlay({ status }: ConnectionOverlayProps): ReactElement | null {
  if (status === 'connected') {
    return null
  }

  // Keep pointer events disabled so terminal selection/copy still works while disconnected.
  if (status === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-sm pointer-events-none">
        <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 text-sm text-foreground shadow-lg">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
          <span>Connecting to daemon…</span>
        </div>
      </div>
    )
  }

  const reconnectLabel = status === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-red-950/35 backdrop-blur-md pointer-events-none">
      <div className="rounded-lg border border-red-300/30 bg-red-900/75 p-4 text-sm font-medium text-red-50 shadow-lg">
        Terminal disconnected. {reconnectLabel}
      </div>
    </div>
  )
}
