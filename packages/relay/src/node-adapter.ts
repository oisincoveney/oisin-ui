import { createServer } from "node:http";
import { URL } from "node:url";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import type { ConnectionRole } from "./types.js";

type RelayProtocolVersion = "1" | "2";

const LEGACY_RELAY_VERSION: RelayProtocolVersion = "1";
const CURRENT_RELAY_VERSION: RelayProtocolVersion = "2";

type Session = {
  controls: Set<WebSocket>;
  clients: Map<string, Set<WebSocket>>;
  serverData: Map<string, WebSocket>;
  pendingFrames: Map<string, Array<string | ArrayBuffer>>;
  legacyServer: WebSocket | null;
  legacyClients: Set<WebSocket>;
  nudgeTimers: Map<string, { initial: ReturnType<typeof setTimeout>; reset: ReturnType<typeof setTimeout> }>;
};

type RelayServer = {
  port: number;
  close: () => Promise<void>;
};

function resolveRelayVersion(rawValue: string | null): RelayProtocolVersion | null {
  if (rawValue == null) return CURRENT_RELAY_VERSION;
  const value = rawValue.trim();
  if (!value) return CURRENT_RELAY_VERSION;
  if (value === LEGACY_RELAY_VERSION || value === CURRENT_RELAY_VERSION) {
    return value;
  }
  return null;
}

function getOrCreateSession(sessions: Map<string, Session>, serverId: string): Session {
  const existing = sessions.get(serverId);
  if (existing) return existing;

  const created: Session = {
    controls: new Set(),
    clients: new Map(),
    serverData: new Map(),
    pendingFrames: new Map(),
    legacyServer: null,
    legacyClients: new Set(),
    nudgeTimers: new Map(),
  };
  sessions.set(serverId, created);
  return created;
}

function listConnectedClientIds(session: Session): string[] {
  const out: string[] = [];
  for (const [clientId, sockets] of session.clients) {
    if (sockets.size > 0) out.push(clientId);
  }
  return out;
}

function toFrame(data: RawData): string | ArrayBuffer {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const out = new Uint8Array(view.byteLength);
    out.set(view);
    return out.buffer;
  }
  const text = data.toString();
  return text;
}

function sendToControls(session: Session, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const control of session.controls) {
    try {
      control.send(payload);
    } catch {
      try {
        control.close(1011, "Control send failed");
      } catch {
        // ignore
      }
    }
  }
}

function bufferClientFrame(session: Session, clientId: string, frame: string | ArrayBuffer): void {
  const queue = session.pendingFrames.get(clientId) ?? [];
  queue.push(frame);
  if (queue.length > 200) {
    queue.splice(0, queue.length - 200);
  }
  session.pendingFrames.set(clientId, queue);
}

function flushClientFrames(session: Session, clientId: string, target: WebSocket): void {
  const queue = session.pendingFrames.get(clientId);
  if (!queue || queue.length === 0) return;
  session.pendingFrames.delete(clientId);
  for (const frame of queue) {
    try {
      target.send(frame);
    } catch {
      bufferClientFrame(session, clientId, frame);
      break;
    }
  }
}

function clearNudgeTimer(session: Session, clientId: string): void {
  const timers = session.nudgeTimers.get(clientId);
  if (!timers) return;
  clearTimeout(timers.initial);
  clearTimeout(timers.reset);
  session.nudgeTimers.delete(clientId);
}

function scheduleNudgeOrReset(session: Session, clientId: string): void {
  clearNudgeTimer(session, clientId);

  const initial = setTimeout(() => {
    const hasClient = (session.clients.get(clientId)?.size ?? 0) > 0;
    const hasServerData = session.serverData.has(clientId);
    if (!hasClient || hasServerData) return;

    sendToControls(session, { type: "sync", clientIds: listConnectedClientIds(session) });

    const reset = setTimeout(() => {
      const stillHasClient = (session.clients.get(clientId)?.size ?? 0) > 0;
      const stillMissingServerData = !session.serverData.has(clientId);
      if (!stillHasClient || !stillMissingServerData) return;
      for (const control of session.controls) {
        try {
          control.close(1011, "Control unresponsive");
        } catch {
          // ignore
        }
      }
      session.nudgeTimers.delete(clientId);
    }, 5_000);

    session.nudgeTimers.set(clientId, { initial, reset });
  }, 10_000);

  const reset = setTimeout(() => {
    // placeholder, replaced after initial fires
  }, 0);
  clearTimeout(reset);
  session.nudgeTimers.set(clientId, { initial, reset });
}

function handleControlMessage(socket: WebSocket, data: RawData): void {
  try {
    const text = typeof data === "string" ? data : data.toString();
    const parsed = JSON.parse(text) as { type?: string };
    if (parsed?.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  } catch {
    // Ignore malformed payloads.
  }
}

function rejectUpgrade(
  socket: { write: (chunk: string) => unknown; destroy: () => void },
  statusCode: number,
  message: string
): void {
  socket.write(
    `HTTP/1.1 ${statusCode} Bad Request\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\nConnection: close\r\n\r\n${message}`
  );
  socket.destroy();
}

export async function createRelayServer({
  port,
  host = "127.0.0.1",
}: {
  port: number;
  host?: string;
}): Promise<RelayServer> {
  const sessions = new Map<string, Session>();
  const httpServer = createServer((req, res) => {
    const reqUrl = req.url ? new URL(req.url, "http://127.0.0.1") : null;
    if (req.method === "GET" && reqUrl?.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  const wsServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url ? new URL(request.url, "http://127.0.0.1") : null;
    if (!requestUrl || requestUrl.pathname !== "/ws") {
      rejectUpgrade(socket, 404, "Not found");
      return;
    }

    const role = requestUrl.searchParams.get("role") as ConnectionRole | null;
    const serverId = requestUrl.searchParams.get("serverId");
    const clientIdRaw = requestUrl.searchParams.get("clientId");
    const clientId = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
    const version = resolveRelayVersion(requestUrl.searchParams.get("v"));

    if (!role || (role !== "server" && role !== "client")) {
      rejectUpgrade(socket, 400, "Missing or invalid role parameter");
      return;
    }
    if (!serverId) {
      rejectUpgrade(socket, 400, "Missing serverId parameter");
      return;
    }
    if (!version) {
      rejectUpgrade(socket, 400, "Invalid v parameter (expected 1 or 2)");
      return;
    }
    if (version === CURRENT_RELAY_VERSION && role === "client" && !clientId) {
      rejectUpgrade(socket, 400, "Missing clientId parameter");
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      const session = getOrCreateSession(sessions, serverId);

      if (version === LEGACY_RELAY_VERSION) {
        if (role === "server") {
          if (session.legacyServer) {
            try {
              session.legacyServer.close(1008, "Replaced by new connection");
            } catch {
              // ignore
            }
          }
          session.legacyServer = ws;
          ws.send(JSON.stringify({ type: "sync", clientIds: listConnectedClientIds(session) }));
          ws.on("message", (data) => {
            const frame = toFrame(data);
            for (const clientSocket of session.legacyClients) {
              try {
                clientSocket.send(frame);
              } catch {
                // ignore
              }
            }
            handleControlMessage(ws, data);
          });
          ws.on("close", () => {
            if (session.legacyServer === ws) session.legacyServer = null;
          });
          return;
        }

        session.legacyClients.add(ws);
        ws.on("message", (data) => {
          if (!session.legacyServer) return;
          try {
            session.legacyServer.send(toFrame(data));
          } catch {
            // ignore
          }
        });
        ws.on("close", () => {
          session.legacyClients.delete(ws);
        });
        return;
      }

      const isServerControl = role === "server" && !clientId;
      const isServerData = role === "server" && !!clientId;

      if (isServerControl) {
        for (const existing of session.controls) {
          existing.close(1008, "Replaced by new connection");
        }
        session.controls.clear();

        session.controls.add(ws);
        ws.send(JSON.stringify({ type: "sync", clientIds: listConnectedClientIds(session) }));
        ws.on("message", (data) => handleControlMessage(ws, data));
        ws.on("close", () => {
          session.controls.delete(ws);
        });
        return;
      }

      if (isServerData && clientId) {
        const existing = session.serverData.get(clientId);
        if (existing) {
          existing.close(1008, "Replaced by new connection");
        }
        session.serverData.set(clientId, ws);
        clearNudgeTimer(session, clientId);
        flushClientFrames(session, clientId, ws);

        ws.on("message", (data) => {
          const targets = session.clients.get(clientId);
          if (!targets || targets.size === 0) return;
          const frame = toFrame(data);
          for (const target of targets) {
            try {
              target.send(frame);
            } catch {
              // ignore
            }
          }
        });

        ws.on("close", () => {
          if (session.serverData.get(clientId) === ws) {
            session.serverData.delete(clientId);
          }
          const targets = session.clients.get(clientId);
          if (!targets) return;
          for (const target of targets) {
            try {
              target.close(1012, "Server disconnected");
            } catch {
              // ignore
            }
          }
        });
        return;
      }

      const clientSockets = session.clients.get(clientId) ?? new Set<WebSocket>();
      clientSockets.add(ws);
      session.clients.set(clientId, clientSockets);
      sendToControls(session, { type: "client_connected", clientId });
      scheduleNudgeOrReset(session, clientId);

      ws.on("message", (data) => {
        const serverData = session.serverData.get(clientId);
        const frame = toFrame(data);
        if (!serverData) {
          bufferClientFrame(session, clientId, frame);
          return;
        }
        try {
          serverData.send(frame);
        } catch {
          bufferClientFrame(session, clientId, frame);
        }
      });

      ws.on("close", () => {
        const sockets = session.clients.get(clientId);
        if (!sockets) return;
        sockets.delete(ws);
        if (sockets.size > 0) return;
        session.clients.delete(clientId);
        clearNudgeTimer(session, clientId);
        session.pendingFrames.delete(clientId);

        const serverData = session.serverData.get(clientId);
        if (serverData) {
          try {
            serverData.close(1001, "Client disconnected");
          } catch {
            // ignore
          }
          session.serverData.delete(clientId);
        }

        sendToControls(session, { type: "client_disconnected", clientId });
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve listening address");
  }

  return {
    port: address.port,
    close: async () => {
      for (const session of sessions.values()) {
        for (const control of session.controls) {
          try {
            control.close();
          } catch {
            // Ignore close errors during shutdown.
          }
        }
        if (session.legacyServer) {
          try {
            session.legacyServer.close();
          } catch {
            // ignore
          }
        }
        for (const legacyClient of session.legacyClients) {
          try {
            legacyClient.close();
          } catch {
            // ignore
          }
        }
        for (const dataSocket of session.serverData.values()) {
          try {
            dataSocket.close();
          } catch {
            // ignore
          }
        }
        for (const clientSockets of session.clients.values()) {
          for (const clientSocket of clientSockets) {
            try {
              clientSocket.close();
            } catch {
              // ignore
            }
          }
        }
        for (const timers of session.nudgeTimers.values()) {
          clearTimeout(timers.initial);
          clearTimeout(timers.reset);
        }
      }
      await new Promise<void>((resolve, reject) => {
        wsServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.RELAY_HOST ?? "0.0.0.0";
  void createRelayServer({ port: Number(process.env.PORT ?? "8080"), host })
    .then((relay) => {
      process.stdout.write(`Relay listening on port ${relay.port}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    });
}
