#!/usr/bin/env bash

set -euo pipefail

export PASEO_HOME="${PASEO_HOME:-/config}"
export PASEO_LISTEN="${PASEO_LISTEN:-0.0.0.0:3000}"
export PASEO_CORS_ORIGINS="${PASEO_CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}"

cd /workspace

if [ ! -d node_modules ]; then
  npm install
fi

echo "Starting daemon and web server..."
npm run dev:server &
DAEMON_PID=$!

npm run dev --workspace=@oisin/web -- --host 0.0.0.0 --port 5173 &
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
