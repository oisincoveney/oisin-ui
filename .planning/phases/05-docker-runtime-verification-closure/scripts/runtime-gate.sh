#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/Users/oisin/dev/oisin-ui"
EVIDENCE_DIR="$ROOT_DIR/.planning/phases/05-docker-runtime-verification-closure/evidence"
COMPOSE_UP_LOG="$EVIDENCE_DIR/compose-up-attached.txt"
COMPOSE_PS_START="$EVIDENCE_DIR/compose-ps-start.json"
COMPOSE_LOGS_START="$EVIDENCE_DIR/compose-logs-start.txt"
PROCESS_TREE="$EVIDENCE_DIR/process-tree.txt"
WS_HANDSHAKE="$EVIDENCE_DIR/ws-handshake.md"
COMPOSE_PS_STOP="$EVIDENCE_DIR/compose-ps-stop.json"
POST_STOP_CHECK="$EVIDENCE_DIR/post-stop-process-check.txt"

cd "$ROOT_DIR"

mkdir -p "$EVIDENCE_DIR"
rm -f \
  "$COMPOSE_UP_LOG" \
  "$COMPOSE_PS_START" \
  "$COMPOSE_LOGS_START" \
  "$PROCESS_TREE" \
  "$WS_HANDSHAKE" \
  "$COMPOSE_PS_STOP" \
  "$POST_STOP_CHECK"

compose_up_pid=""

cleanup() {
  if [[ -n "$compose_up_pid" ]] && kill -0 "$compose_up_pid" 2>/dev/null; then
    kill -INT "$compose_up_pid" 2>/dev/null || true
    wait "$compose_up_pid" || true
  fi
}

trap cleanup EXIT

docker compose down --remove-orphans >/dev/null 2>&1 || true

docker compose up --build >"$COMPOSE_UP_LOG" 2>&1 &
compose_up_pid=$!

ready=0
for _ in $(seq 1 90); do
  if grep -q "Server listening on http://0.0.0.0:6767" "$COMPOSE_UP_LOG" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Daemon did not become ready in time" >&2
  exit 1
fi

if grep -q "Another Paseo daemon is already running" "$COMPOSE_UP_LOG"; then
  echo "Detected daemon lock churn before verification window" >&2
  exit 1
fi

docker compose ps --format json > "$COMPOSE_PS_START"
docker compose logs --no-color --timestamps > "$COMPOSE_LOGS_START"

container_id="$(docker compose ps -q oisin-ui)"
if [[ -z "$container_id" ]]; then
  echo "Could not resolve oisin-ui container id" >&2
  exit 1
fi
docker top "$container_id" > "$PROCESS_TREE"

ws_probe_tmp="$EVIDENCE_DIR/.ws-probe.tmp"
node <<'NODE' > "$ws_probe_tmp"
const WebSocket = require("ws");

const target = "ws://localhost:6767/ws?clientSessionKey=web-client";
const startedAt = new Date().toISOString();
let status = "no";
let error = null;
let closeCode = null;
let closeReason = "";
let done = false;

const ws = new WebSocket(target, { handshakeTimeout: 8000 });

function finish(exitCode) {
  if (done) {
    return;
  }
  done = true;
  const completedAt = new Date().toISOString();
  const lines = [
    "# WebSocket Handshake Evidence",
    "",
    `- Timestamp (UTC): ${startedAt}`,
    `- Target URL: ${target}`,
    "- Expected status: 101 Switching Protocols",
    `- HTTP 101 seen: ${status}`,
    `- Socket close code: ${closeCode ?? "n/a"}`,
    `- Socket close reason: ${closeReason || "n/a"}`,
    `- Error: ${error ?? "none"}`,
    `- Completed at (UTC): ${completedAt}`,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(exitCode);
}

const timeout = setTimeout(() => {
  error = error ?? "timeout waiting for websocket open";
  finish(1);
}, 12000);

ws.on("upgrade", (res) => {
  if (res.statusCode === 101) {
    status = "yes";
  }
});

ws.on("open", () => {
  status = "yes";
  ws.close(1000, "runtime-gate-complete");
});

ws.on("unexpected-response", (_req, res) => {
  error = `unexpected response status ${res.statusCode}`;
  finish(1);
});

ws.on("error", (err) => {
  error = err instanceof Error ? err.message : String(err);
});

ws.on("close", (code, reasonBuffer) => {
  clearTimeout(timeout);
  closeCode = code;
  closeReason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : "";
  finish(status === "yes" ? 0 : 1);
});
NODE

mv "$ws_probe_tmp" "$WS_HANDSHAKE"

kill -INT "$compose_up_pid" 2>/dev/null || true
wait "$compose_up_pid" || true
compose_up_pid=""

docker compose down --remove-orphans
docker compose ps --all --format json > "$COMPOSE_PS_STOP"
if [[ ! -s "$COMPOSE_PS_STOP" ]]; then
  printf "[]\n" > "$COMPOSE_PS_STOP"
fi

running_after_stop="$(docker compose ps --status running -q)"
if [[ -n "$running_after_stop" ]]; then
  {
    echo "orphans-found"
    echo "running-compose-services: $running_after_stop"
  } > "$POST_STOP_CHECK"
  echo "Compose services still running after stop" >&2
  exit 1
fi

project_containers="$(docker ps -q --filter label=com.docker.compose.project=oisin-ui)"
if [[ -n "$project_containers" ]]; then
  {
    echo "orphans-found"
    echo "running-project-containers: $project_containers"
  } > "$POST_STOP_CHECK"
  echo "Project containers still running after stop" >&2
  exit 1
fi

{
  echo "no-orphan-processes-detected"
  echo "checked-at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "compose-project: oisin-ui"
} > "$POST_STOP_CHECK"

if ! grep -q "HTTP 101 seen: yes" "$WS_HANDSHAKE"; then
  echo "WebSocket handshake did not reach HTTP 101" >&2
  exit 1
fi

if ! grep -q "no-orphan-processes-detected" "$POST_STOP_CHECK"; then
  echo "Post-stop orphan check failed" >&2
  exit 1
fi

echo "Runtime gate passed"
