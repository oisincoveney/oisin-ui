import type { ConnectionStatus } from '../lib/ws'
import type { ReactElement } from 'react'

type ConnectionOverlayProps = {
  status: ConnectionStatus
  diagnostics: {
    endpoint: string
    wsFailureReason: string | null
    attachFailureReason: string | null
  }
}

export function ConnectionOverlay({ status, diagnostics }: ConnectionOverlayProps): ReactElement | null {
  if (status === 'connected') {
    return null
  }

  // Keep pointer events disabled so terminal selection/copy still works while disconnected.
  if (status === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-sm pointer-events-none">
        <div className="flex max-w-[min(560px,92vw)] flex-col gap-2 rounded-lg border border-border/50 bg-card p-4 text-sm text-foreground shadow-lg">
          <div className="flex items-center gap-3">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
            <span>Connecting to daemon…</span>
          </div>
          <div className="font-mono text-xs text-muted-foreground">endpoint: {diagnostics.endpoint}</div>
        </div>
      </div>
    )
  }

  const reconnectLabel = status === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'
  const failureReason = diagnostics.attachFailureReason ?? diagnostics.wsFailureReason

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-red-950/35 backdrop-blur-md pointer-events-none">
      <div className="max-w-[min(640px,94vw)] rounded-lg border border-red-300/30 bg-red-900/75 p-4 text-sm font-medium text-red-50 shadow-lg">
        <div>Terminal disconnected. {reconnectLabel}</div>
        <div className="mt-2 font-mono text-xs text-red-100/90">endpoint: {diagnostics.endpoint}</div>
        {failureReason ? (
          <div className="mt-2 text-xs font-normal text-red-100/90">reason: {failureReason}</div>
        ) : (
          <div className="mt-2 text-xs font-normal text-red-100/75">reason: waiting for daemon websocket + terminal attach</div>
        )}
      </div>
    </div>
  )
}
