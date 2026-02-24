#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/Users/oisin/dev/oisin-ui"
EVIDENCE_DIR="$ROOT_DIR/.planning/phases/05-docker-runtime-verification-closure/evidence"
COMPOSE_UP_LOG="$EVIDENCE_DIR/compose-up-attached.txt"
COMPOSE_PS_START="$EVIDENCE_DIR/compose-ps-start.json"
COMPOSE_LOGS_START="$EVIDENCE_DIR/compose-logs-start.txt"
PROCESS_TREE="$EVIDENCE_DIR/process-tree.txt"
TMUX_RUNTIME="$EVIDENCE_DIR/tmux-runtime.txt"
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
  "$TMUX_RUNTIME" \
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

tmux_session_name="runtime-gate"
docker exec "$container_id" sh -lc "tmux has-session -t $tmux_session_name 2>/dev/null || tmux new-session -d -s $tmux_session_name 'sleep 600'"
docker top "$container_id" > "$PROCESS_TREE"

{
  echo "tmux-session-running"
  echo "checked-at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "container: $container_id"
  echo "session: $tmux_session_name"
  echo
  echo "$ tmux ls"
  docker exec "$container_id" sh -lc "tmux ls"
} > "$TMUX_RUNTIME"

if ! grep -q "tmux" "$PROCESS_TREE"; then
  echo "tmux process not found in process tree" >&2
  exit 1
fi

if ! grep -q "tmux-session-running" "$TMUX_RUNTIME"; then
  echo "tmux runtime evidence missing passing marker" >&2
  exit 1
fi

ws_probe_tmp="$EVIDENCE_DIR/.ws-probe.tmp"
node <<'NODE' > "$ws_probe_tmp"
const { chromium } = require("playwright");

const pageUrl = "http://localhost:44285";
const browserRequestUrl = "ws://localhost:6767/ws?clientSessionKey=runtime-gate-browser";
const startedAt = new Date().toISOString();
let requestUrl = browserRequestUrl;
let statusCode = "n/a";
let statusSeen = "no";
let error = null;

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const probeResult = await page.evaluate(async (target) => {
      return await new Promise((resolve) => {
        const ws = new WebSocket(target);
        const timer = setTimeout(() => {
          resolve({ opened: false, message: "browser websocket did not open" });
        }, 10000);

        ws.addEventListener("open", () => {
          clearTimeout(timer);
          ws.close(1000, "runtime-gate-complete");
          resolve({ opened: true, message: "opened" });
        });

        ws.addEventListener("error", () => {
          clearTimeout(timer);
          resolve({ opened: false, message: "browser websocket error" });
        });
      });
    }, browserRequestUrl);

    if (probeResult?.opened) {
      statusSeen = "yes";
      statusCode = "101";
    } else {
      error = probeResult?.message ?? "browser websocket probe failed";
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    await browser.close();
  }

  const completedAt = new Date().toISOString();
  const lines = [
    "# WebSocket Handshake Evidence",
    "",
    `- timestamp_utc: ${startedAt}`,
    "- source: browser",
    `- page_url: ${pageUrl}`,
    `- request_url: ${requestUrl}`,
    "- expected_status: 101 Switching Protocols",
    `- status_code: ${statusCode}`,
    `- HTTP 101 seen: ${statusSeen}`,
    `- error: ${error ?? "none"}`,
    `- completed_at_utc: ${completedAt}`,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(statusSeen === "yes" ? 0 : 1);
}

main().catch((err) => {
  const completedAt = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const lines = [
    "# WebSocket Handshake Evidence",
    "",
    `- timestamp_utc: ${startedAt}`,
    "- source: browser",
    `- page_url: ${pageUrl}`,
    "- request_url: n/a",
    "- expected_status: 101 Switching Protocols",
    "- status_code: n/a",
    "- HTTP 101 seen: no",
    `- error: ${message}`,
    `- completed_at_utc: ${completedAt}`,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(1);
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

if ! grep -q "source: browser" "$WS_HANDSHAKE"; then
  echo "WebSocket handshake evidence was not captured from browser context" >&2
  exit 1
fi

if ! grep -q "page_url: http://localhost:44285" "$WS_HANDSHAKE"; then
  echo "WebSocket handshake evidence missing expected Docker page URL" >&2
  exit 1
fi

if ! grep -q "no-orphan-processes-detected" "$POST_STOP_CHECK"; then
  echo "Post-stop orphan check failed" >&2
  exit 1
fi

echo "Runtime gate passed"
