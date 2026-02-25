#!/usr/bin/env bash

set -euo pipefail

export PASEO_HOME="${PASEO_HOME:-/config}"
export PASEO_LISTEN="${PASEO_LISTEN:-0.0.0.0:6767}"
export PASEO_CORS_ORIGINS="${PASEO_CORS_ORIGINS:-http://localhost:44285,http://127.0.0.1:44285,http://0.0.0.0:44285}"
export PASEO_DICTATION_ENABLED="${PASEO_DICTATION_ENABLED:-0}"
export PASEO_VOICE_MODE_ENABLED="${PASEO_VOICE_MODE_ENABLED:-0}"

mkdir -p "$PASEO_HOME"
LOCK_PATH="$PASEO_HOME/paseo.pid"

set +e
LOCK_PREFLIGHT_RESULT="$(node - "$LOCK_PATH" <<'NODE'
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, unlinkSync } = require("node:fs");

const lockPath = process.argv[2];

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearLock(reason) {
  try {
    unlinkSync(lockPath);
  } catch {
    // ignore
  }
  console.log(reason);
}

function getPsValue(pid, format) {
  try {
    return execFileSync("ps", ["-o", `${format}=`, "-p", String(pid)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

if (!existsSync(lockPath)) {
  console.log("no-lock");
  process.exit(0);
}

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, "utf-8"));
} catch {
  clearLock("cleared-stale-invalid-lock");
  process.exit(0);
}

if (!lock || typeof lock.pid !== "number") {
  clearLock("cleared-stale-invalid-lock");
  process.exit(0);
}

if (!isPidRunning(lock.pid)) {
  clearLock(`cleared-stale-dead-pid:${lock.pid}`);
  process.exit(0);
}

const command = getPsValue(lock.pid, "command");
const startedAt = getPsValue(lock.pid, "lstart");
if (!command || !startedAt) {
  console.log(`active-lock-unknown:${lock.pid}`);
  process.exit(2);
}

const daemonCommand = /\bpaseo\b|dev:server|@oisin\/server|packages\/server/i.test(command);
const lockStartedAt = Date.parse(String(lock.startedAt ?? ""));
const processStartedAt = Date.parse(startedAt);
const sameStartWindow = Number.isFinite(lockStartedAt) && Number.isFinite(processStartedAt)
  ? Math.abs(processStartedAt - lockStartedAt) <= 10000
  : false;

if (daemonCommand && sameStartWindow) {
  console.log(`active-lock-daemon:${lock.pid}:${String(lock.startedAt ?? "unknown")}`);
  process.exit(2);
}

clearLock(`cleared-stale-pid-reuse:${lock.pid}`);
process.exit(0);
NODE
)"
LOCK_PREFLIGHT_STATUS=$?
set -e

if [[ "$LOCK_PREFLIGHT_STATUS" -eq 0 ]]; then
  if [[ "$LOCK_PREFLIGHT_RESULT" == no-lock ]]; then
    echo "PID lock preflight: no existing lock file"
  elif [[ "$LOCK_PREFLIGHT_RESULT" == cleared-stale-* ]]; then
    echo "PID lock preflight: $LOCK_PREFLIGHT_RESULT"
  fi
else
  echo "PID lock preflight: active lock owner detected ($LOCK_PREFLIGHT_RESULT), refusing startup" >&2
  exit 1
fi

DAEMON_PORT="${PASEO_LISTEN##*:}"
if [[ ! "$DAEMON_PORT" =~ ^[0-9]+$ ]]; then
  echo "PASEO_LISTEN must end with a TCP port, got: $PASEO_LISTEN" >&2
  exit 1
fi

export VITE_DAEMON_PORT="$DAEMON_PORT"

cd /workspace

if [ ! -d node_modules ]; then
  bun install
fi

echo "Starting daemon and web server..."
bun run dev:server -- --no-relay --no-mcp &
DAEMON_PID=$!

bun run --filter @oisin/web dev -- --host 0.0.0.0 --port 44285 &
WEB_PID=$!

cleanup() {
  for pid in "$DAEMON_PID" "$WEB_PID"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" || true
      wait "$pid" || true
    fi
  done
}

trap 'cleanup' SIGTERM SIGINT EXIT

while true; do
  wait -n "$DAEMON_PID" "$WEB_PID"
  EXIT_CODE=$?

  if kill -0 "$DAEMON_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; then
    continue
  fi

  echo "One process stopped; shutting down container..."
  exit "$EXIT_CODE"
done
