#!/usr/bin/env bash

set -euo pipefail

export PASEO_HOME="${PASEO_HOME:-/config}"
export PASEO_LISTEN="${PASEO_LISTEN:-0.0.0.0:6767}"
export PASEO_CORS_ORIGINS="${PASEO_CORS_ORIGINS:-http://localhost:44285,http://127.0.0.1:44285,http://0.0.0.0:44285}"
export PASEO_DICTATION_ENABLED="${PASEO_DICTATION_ENABLED:-0}"
export PASEO_VOICE_MODE_ENABLED="${PASEO_VOICE_MODE_ENABLED:-0}"

if [[ "${PASEO_PRESTART_CLEAN_LOCK:-0}" == "1" ]]; then
  mkdir -p "$PASEO_HOME"
  rm -f "$PASEO_HOME/paseo.pid"
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
