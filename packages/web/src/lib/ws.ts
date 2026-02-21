import { Effect, Ref } from 'effect'
import { useEffect, useState } from 'react'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

type ConnectionStatusListener = (status: ConnectionStatus) => void

type PingMessage = {
  type: 'ping'
  requestId?: string
}

type PongMessage = {
  type: 'pong'
  requestId?: string
}

const WS_URL = 'ws://localhost:3000'
const BASE_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 30_000

const currentStatusRef = Effect.runSync(Ref.make<ConnectionStatus>('disconnected'))
const listenersRef = Effect.runSync(Ref.make<Set<ConnectionStatusListener>>(new Set()))
const retryCountRef = Effect.runSync(Ref.make(0))

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let shouldStop = false
let started = false
let subscriberCount = 0

function runSync<T>(effect: Effect.Effect<T>): T {
  return Effect.runSync(effect)
}

function isPingMessage(message: unknown): message is PingMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'ping'
  )
}

function emit(status: ConnectionStatus): void {
  runSync(
    Effect.gen(function* () {
      const current = yield* Ref.get(currentStatusRef)
      if (current === status) {
        return
      }

      yield* Ref.set(currentStatusRef, status)
      const listeners = yield* Ref.get(listenersRef)
      for (const listener of listeners) {
        listener(status)
      }
    })
  )
}

function currentStatus(): ConnectionStatus {
  return runSync(Ref.get(currentStatusRef))
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function computeBackoffDelay(retries: number): number {
  if (retries <= 0) {
    return BASE_RETRY_DELAY_MS
  }

  const exponential = BASE_RETRY_DELAY_MS * 2 ** retries
  return Math.min(exponential, MAX_RETRY_DELAY_MS)
}

function scheduleReconnect(): void {
  if (shouldStop) {
    return
  }

  clearReconnectTimer()

  const nextRetry = runSync(Ref.get(retryCountRef)) + 1
  runSync(Ref.set(retryCountRef, nextRetry))

  const delay = computeBackoffDelay(nextRetry)
  emit('disconnected')

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (shouldStop) {
      return
    }
    connect()
  }, delay)
}

function sendIfOpen(payload: PongMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function handleSocketMessage(event: MessageEvent): void {
  if (typeof event.data !== 'string') {
    return
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(event.data)
  } catch {
    return
  }

  if (!isPingMessage(parsed)) {
    return
  }

  sendIfOpen({ type: 'pong', requestId: parsed.requestId })
}

function connect(): void {
  if (shouldStop || !started) {
    return
  }

  if (
    socket !== null &&
    (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
  ) {
    return
  }

  emit('connecting')

  socket = new WebSocket(WS_URL)

  socket.addEventListener('open', () => {
    emit('connected')
    runSync(Ref.set(retryCountRef, 0))
    clearReconnectTimer()
  })

  socket.addEventListener('message', handleSocketMessage)

  socket.addEventListener('close', () => {
    if (shouldStop) {
      emit('disconnected')
      return
    }

    scheduleReconnect()
  })

  socket.addEventListener('error', () => {
    if (shouldStop) {
      emit('disconnected')
      return
    }

    scheduleReconnect()
  })
}

function stop(): void {
  shouldStop = true
  started = false
  clearReconnectTimer()
  emit('disconnected')

  if (
    socket !== null &&
    socket.readyState !== WebSocket.CLOSING &&
    socket.readyState !== WebSocket.CLOSED
  ) {
    socket.close()
  }

  socket = null
}

export function startConnection(): void {
  if (started) {
    return
  }

  shouldStop = false
  started = true
  connect()
}

export function subscribeConnectionStatus(listener: ConnectionStatusListener): () => void {
  runSync(
    Ref.update(listenersRef, (listeners) => {
      const next = new Set(listeners)
      next.add(listener)
      return next
    })
  )

  return () => {
    runSync(
      Ref.update(listenersRef, (listeners) => {
        const next = new Set(listeners)
        next.delete(listener)
        return next
      })
    )
  }
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus())

  useEffect(() => {
    startConnection()
    subscriberCount += 1

    const unsubscribe = subscribeConnectionStatus(setStatus)

    setStatus(currentStatus())

    return () => {
      unsubscribe()
      subscriberCount -= 1

      if (subscriberCount <= 0) {
        stop()
      }
    }
  }, [])

  return status
}

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus()
}
