import { Effect, Ref } from "effect";
import { useEffect, useState } from "react";

export type ConnectionStatus =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected";

export type ConnectionDiagnostics = {
  wsUrl: string;
  endpoint: string;
  lastFailureReason: string | null;
  lastFailureHint: string | null;
};

type ConnectionStatusListener = (status: ConnectionStatus) => void;
type ConnectionDiagnosticsListener = (diagnostics: ConnectionDiagnostics) => void;

type PingMessage = {
  type: "ping";
  requestId?: string;
};

type PongMessage = {
  type: "pong";
  requestId?: string;
};

type WrappedSessionMessage = {
  type: "session";
  message: unknown;
};

const DEFAULT_DAEMON_PORT = 6767;

function resolveDaemonPort(): string {
  const configuredPort = import.meta.env.VITE_DAEMON_PORT;
  if (!configuredPort) {
    return String(DEFAULT_DAEMON_PORT);
  }

  const parsedPort = Number.parseInt(configuredPort, 10);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    return String(DEFAULT_DAEMON_PORT);
  }

  return String(parsedPort);
}

function resolveWsTarget(): { wsUrl: string; endpoint: string } {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  const port = resolveDaemonPort();

  return {
    wsUrl: `${protocol}//${hostname}:${port}/ws?clientSessionKey=web-client`,
    endpoint: `${hostname}:${port}`,
  };
}

const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;

const currentStatusRef = Effect.runSync(
  Ref.make<ConnectionStatus>("disconnected"),
);
const listenersRef = Effect.runSync(
  Ref.make<Set<ConnectionStatusListener>>(new Set()),
);
const retryCountRef = Effect.runSync(Ref.make(0));

let connectionDiagnostics: ConnectionDiagnostics = {
  ...resolveWsTarget(),
  lastFailureReason: null,
  lastFailureHint: null,
};
const connectionDiagnosticsListeners = new Set<ConnectionDiagnosticsListener>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldStop = false;
let started = false;
let subscriberCount = 0;

function runSync<T>(effect: Effect.Effect<T>): T {
  return Effect.runSync(effect);
}

function isPingMessage(message: unknown): message is PingMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "ping"
  );
}

function emit(status: ConnectionStatus): void {
  runSync(
    Effect.gen(function* () {
      const current = yield* Ref.get(currentStatusRef);
      if (current === status) {
        return;
      }

      yield* Ref.set(currentStatusRef, status);
      const listeners = yield* Ref.get(listenersRef);
      for (const listener of listeners) {
        listener(status);
      }
    }),
  );
}

function currentStatus(): ConnectionStatus {
  return runSync(Ref.get(currentStatusRef));
}

function emitConnectionDiagnostics(next: ConnectionDiagnostics): void {
  connectionDiagnostics = next;
  for (const listener of connectionDiagnosticsListeners) {
    listener(next);
  }
}

function patchConnectionDiagnostics(
  patch: Partial<ConnectionDiagnostics>,
): void {
  emitConnectionDiagnostics({
    ...connectionDiagnostics,
    ...patch,
  });
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function computeBackoffDelay(retries: number): number {
  if (retries <= 0) {
    return BASE_RETRY_DELAY_MS;
  }

  const exponential = BASE_RETRY_DELAY_MS * 2 ** retries;
  return Math.min(exponential, MAX_RETRY_DELAY_MS);
}

function scheduleReconnect(reason: "close" | "error"): void {
  if (shouldStop) {
    return;
  }

  if (reconnectTimer !== null) {
    return;
  }

  emit("disconnected");

  const nextRetry = runSync(Ref.get(retryCountRef)) + 1;
  runSync(Ref.set(retryCountRef, nextRetry));

  const delay = computeBackoffDelay(nextRetry);
  console.warn(
    `[ws] ${reason} detected; reconnect attempt #${nextRetry} in ${delay}ms`,
  );
  emit("reconnecting");

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldStop) {
      return;
    }
    connect();
  }, delay);
}

function sendIfOpen(payload: PongMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function sendWsMessage(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "session",
        message,
      } satisfies WrappedSessionMessage),
    );
  }
}

export function sendWsBinary(data: Uint8Array): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(data);
  }
}

type TextMessageListener = (data: unknown) => void;
type BinaryMessageListener = (data: Uint8Array) => void;

const textListenersRef = Effect.runSync(
  Ref.make<Set<TextMessageListener>>(new Set()),
);
const binaryListenersRef = Effect.runSync(
  Ref.make<Set<BinaryMessageListener>>(new Set()),
);

export function subscribeTextMessages(listener: TextMessageListener): () => void {
  runSync(
    Ref.update(textListenersRef, (listeners) => {
      const next = new Set(listeners);
      next.add(listener);
      return next;
    }),
  );
  return () => {
    runSync(
      Ref.update(textListenersRef, (listeners) => {
        const next = new Set(listeners);
        next.delete(listener);
        return next;
      }),
    );
  };
}

export function subscribeBinaryMessages(listener: BinaryMessageListener): () => void {
  runSync(
    Ref.update(binaryListenersRef, (listeners) => {
      const next = new Set(listeners);
      next.add(listener);
      return next;
    }),
  );
  return () => {
    runSync(
      Ref.update(binaryListenersRef, (listeners) => {
        const next = new Set(listeners);
        next.delete(listener);
        return next;
      }),
    );
  };
}

function handleSocketMessage(event: MessageEvent): void {
  if (event.data instanceof Blob) {
    event.data.arrayBuffer().then((buffer: ArrayBuffer) => {
      const data = new Uint8Array(buffer);
      const listeners = runSync(Ref.get(binaryListenersRef));
      for (const listener of listeners) {
        listener(data);
      }
    });
    return;
  }

  if (event.data instanceof ArrayBuffer) {
    const data = new Uint8Array(event.data);
    const listeners = runSync(Ref.get(binaryListenersRef));
    for (const listener of listeners) {
      listener(data);
    }
    return;
  }

  if (event.data instanceof Uint8Array) {
    const listeners = runSync(Ref.get(binaryListenersRef));
    for (const listener of listeners) {
      listener(event.data);
    }
    return;
  }

  if (typeof event.data !== "string") {
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(event.data);
  } catch {
    return;
  }

  if (isPingMessage(parsed)) {
    sendIfOpen({ type: "pong", requestId: parsed.requestId });
    return;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === "session"
  ) {
    const sessionMessage = (parsed as { message?: unknown }).message;
    if (sessionMessage === undefined) {
      return;
    }
    const listeners = runSync(Ref.get(textListenersRef));
    for (const listener of listeners) {
      listener(sessionMessage);
    }
    return;
  }

  const listeners = runSync(Ref.get(textListenersRef));
  for (const listener of listeners) {
    listener(parsed);
  }
}

function connect(): void {
  if (shouldStop || !started) {
    return;
  }

  if (
    socket !== null &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  const currentRetry = runSync(Ref.get(retryCountRef));
  const target = resolveWsTarget();
  patchConnectionDiagnostics(target);
  emit(currentRetry > 0 ? "reconnecting" : "connecting");
  console.info(
    `[ws] connecting to ${target.wsUrl}${
      currentRetry > 0 ? ` (attempt #${currentRetry})` : ""
    }`,
  );

  const nextSocket = new WebSocket(target.wsUrl);
  nextSocket.binaryType = "arraybuffer";
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) {
      return;
    }
    emit("connected");
    console.info("[ws] connected");
    patchConnectionDiagnostics({ lastFailureReason: null, lastFailureHint: null });
    runSync(Ref.set(retryCountRef, 0));
    clearReconnectTimer();
  });

  nextSocket.addEventListener("message", handleSocketMessage);

  nextSocket.addEventListener("close", (event) => {
    if (socket !== nextSocket) {
      return;
    }

    socket = null;
    if (shouldStop) {
      emit("disconnected");
      return;
    }

    const closeReason = event.wasClean
      ? `WebSocket closed (${event.code})`
      : `WebSocket closed unexpectedly (${event.code})`;
    patchConnectionDiagnostics({
      lastFailureReason: closeReason,
      lastFailureHint:
        "Verify daemon is reachable at endpoint and web/daemon ports are aligned",
    });

    scheduleReconnect("close");
  });

  nextSocket.addEventListener("error", () => {
    if (socket !== nextSocket) {
      return;
    }

    console.error("[ws] socket error before reconnect");
    patchConnectionDiagnostics({
      lastFailureReason: "WebSocket transport error while connecting",
      lastFailureHint:
        "Check daemon process health and PASEO_LISTEN/VITE_DAEMON_PORT values",
    });
    if (shouldStop) {
      emit("disconnected");
      return;
    }

    scheduleReconnect("error");
  });
}

function stop(): void {
  shouldStop = true;
  started = false;
  clearReconnectTimer();
  emit("disconnected");

  if (
    socket !== null &&
    socket.readyState !== WebSocket.CLOSING &&
    socket.readyState !== WebSocket.CLOSED
  ) {
    socket.close();
  }

  socket = null;
}

export function startConnection(): void {
  if (started) {
    return;
  }

  shouldStop = false;
  started = true;
  connect();
}

export function subscribeConnectionStatus(
  listener: ConnectionStatusListener,
): () => void {
  runSync(
    Ref.update(listenersRef, (listeners) => {
      const next = new Set(listeners);
      next.add(listener);
      return next;
    }),
  );

  return () => {
    runSync(
      Ref.update(listenersRef, (listeners) => {
        const next = new Set(listeners);
        next.delete(listener);
        return next;
      }),
    );
  };
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus());

  useEffect(() => {
    startConnection();
    subscriberCount += 1;

    const unsubscribe = subscribeConnectionStatus(setStatus);

    setStatus(currentStatus());

    return () => {
      unsubscribe();
      subscriberCount -= 1;

      if (subscriberCount <= 0) {
        stop();
      }
    };
  }, []);

  return status;
}

export function getConnectionDiagnostics(): ConnectionDiagnostics {
  return connectionDiagnostics;
}

export function subscribeConnectionDiagnostics(
  listener: ConnectionDiagnosticsListener,
): () => void {
  connectionDiagnosticsListeners.add(listener);
  return () => {
    connectionDiagnosticsListeners.delete(listener);
  };
}

export function useConnectionDiagnostics(): ConnectionDiagnostics {
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics>(
    getConnectionDiagnostics(),
  );

  useEffect(() => {
    const unsubscribe = subscribeConnectionDiagnostics(setDiagnostics);
    setDiagnostics(getConnectionDiagnostics());
    return unsubscribe;
  }, []);

  return diagnostics;
}

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus();
}
