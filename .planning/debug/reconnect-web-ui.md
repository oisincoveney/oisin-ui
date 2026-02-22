---
status: investigating
trigger: "User reported: No,The second I open the web page, I just get the disabled input reconnecting message.But generally, yes, I can run the command and it opens at 5173.\nTest expected: User can run docker-compose up --build -d and it spins up a single container running both daemon and web UI seamlessly."
created: 2026-02-22T01:31:34Z
updated: 2026-02-22T01:50:30Z
---

## Current Focus

hypothesis: websocket URL is hardcoded to ws://localhost:3000 and can be wrong in containerized deployments
test: verify ws client URL versus compose port mappings and daemon host binding
expecting: if host/port mismatch exists, overlay will remain disconnected despite daemon up
next_action: document diagnosis and required changes in UAT.md

## Symptoms

expected: User can run docker-compose up --build -d and open a working web UI that stays connected to websocket
actual: Opening the web page immediately shows a disabled input and "reconnecting" state
errors: disabled input reconnecting message shown in web UI
reproduction: run docker-compose up --build -d, open web page on exposed port
started: immediately when opening web page in Docker deployment

## Eliminated

- hypothesis: websocket server rejects connections due origin/host checks
  evidence: allowed origins include `http://localhost:5173` and defaults include `http://localhost:<daemon-port>`, and host validation allows localhost/default IPs by default; connection failures are more consistent with endpoint mismatch
  timestamp: 2026-02-22T01:45:00Z

## Evidence

- timestamp: 2026-02-22T01:37:10Z
  checked: `packages/web/src/lib/ws.ts` websocket endpoint constant
  found: client always dials `ws://localhost:3000/ws?clientSessionKey=web-client`
  implication: UI assumes daemon WebSocket is always on the browser's localhost:3000

- timestamp: 2026-02-22T01:37:10Z
  checked: `packages/server/src/server/websocket-server.ts` WebSocketServer configuration
  found: server registers WebSocket upgrade on `path: "/ws"` and requires query `clientSessionKey` for direct connections
  implication: frontend path matches, and missing/invalid URL would only fail at connect stage, matching reconnect behavior

- timestamp: 2026-02-22T01:37:10Z
  checked: `packages/server/src/server/bootstrap.ts` server startup host/port
  found: daemon listens on `listenTarget.host:listenTarget.port` from `PASEO_LISTEN` and is set to `0.0.0.0:3000` in container startup defaults
  implication: daemon is reachable only on mapped host port 3000 when using docker-compose

- timestamp: 2026-02-22T01:37:10Z
  checked: `docker-compose.yml` and `scripts/start.sh`
  found: compose publishes container ports `3000:3000` and `5173:5173`; start script also starts both daemon and web with explicit `--host 0.0.0.0 --port 5173`
  implication: web UI is served on 5173 while websocket remains on a separate host/port endpoint, so hardcoding 3000 in browser can mismatch if not mapped/routable

- timestamp: 2026-02-22T01:41:22Z
  checked: `packages/server/src/server/bootstrap.ts` and `packages/server/src/server/config.ts`
  found: server allows websocket origins from `corsAllowedOrigins` and defaults include `http://localhost:${listenPort}` and `http://127.0.0.1:${listenPort}`; start.sh also sets `PASEO_CORS_ORIGINS` to localhost on 5173
  implication: origin/host validation is not the blocking factor for `localhost:5173` UI access

## Resolution

root_cause: Web UI websocket endpoint is hardcoded to `ws://localhost:3000/ws?clientSessionKey=web-client` in `packages/web/src/lib/ws.ts`, so browser connections are bound to the local machine host instead of deriving the daemon host from the current UI origin/compose networking context.
fix: Configure websocket base URL dynamically (e.g. from `window.location` or a Vite env var such as `VITE_DAEMON_WS_URL`) and default to same-origin or `ws://localhost:3000` only as a local fallback. Ensure compose docs and startup script pass the configured URL into web dev/build.
verification:
files_changed: []
