#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/Users/oisin/dev/oisin-ui"
EVIDENCE_DIR="$ROOT_DIR/.planning/phases/05-docker-runtime-verification-closure/evidence"
RESTART_LOGS="$EVIDENCE_DIR/restart-compose-logs.txt"
WS_STABILITY="$EVIDENCE_DIR/restart-ws-stability.md"

cd "$ROOT_DIR"

mkdir -p "$EVIDENCE_DIR"
rm -f "$RESTART_LOGS" "$WS_STABILITY"

docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up --build -d

set +e
node - "$ROOT_DIR" "$WS_STABILITY" <<'NODE'
const { execSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { chromium } = require("playwright");

const rootDir = process.argv[2];
const wsStabilityPath = process.argv[3];
const readyMarker = "Server listening on http://0.0.0.0:6767";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function readyMarkerCount() {
  try {
    const logs = execSync("docker compose logs --no-color oisin-ui", {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const matches = logs.match(new RegExp(readyMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

async function waitForReadyCount(timeoutMs, minimumCount) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (readyMarkerCount() >= minimumCount) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function openWsProbe(page, url) {
  return page.evaluate(async (target) => {
    return await new Promise((resolve) => {
      const ws = new WebSocket(target);
      const timer = setTimeout(() => {
        resolve({ opened: false, reason: "timeout" });
      }, 10_000);

      ws.addEventListener("open", () => {
        clearTimeout(timer);
        ws.close(1000, "probe-complete");
        resolve({ opened: true, reason: "opened" });
      });

      ws.addEventListener("error", () => {
        clearTimeout(timer);
        resolve({ opened: false, reason: "error" });
      });
    });
  }, url);
}

async function main() {
  const startedAt = new Date().toISOString();
  const wsUrl = "ws://localhost:6767/ws?clientSessionKey=restart-stability-browser";
  const readyBefore = await waitForReadyCount(90_000, 1);
  if (!readyBefore) {
    throw new Error("daemon did not become ready before restart checks");
  }

  const browser = await chromium.launch({ headless: true });
  let preRestartConnected = false;
  let postRestartConnected = false;
  let reconnectLoopDetected = false;
  let probeOpenEvents = 0;
  let probeCloseEvents = 0;
  let probeErrorEvents = 0;
  let finalConnected = false;
  let error = "none";

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:44285", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const preProbe = await openWsProbe(page, wsUrl);
    preRestartConnected = Boolean(preProbe?.opened);
    if (preProbe?.opened) {
      probeOpenEvents += 1;
      probeCloseEvents += 1;
    } else {
      probeErrorEvents += 1;
    }
    if (!preRestartConnected) {
      throw new Error(`pre-restart websocket probe failed: ${preProbe?.reason ?? "unknown"}`);
    }

    const readyCountBeforeRestart = readyMarkerCount();

    execSync("docker compose restart oisin-ui", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const readyAfter = await waitForReadyCount(
      90_000,
      readyCountBeforeRestart + 1
    );
    if (!readyAfter) {
      throw new Error("daemon did not become ready after restart");
    }

    const postProbe = await openWsProbe(page, wsUrl);
    postRestartConnected = Boolean(postProbe?.opened);
    if (postProbe?.opened) {
      probeOpenEvents += 1;
      probeCloseEvents += 1;
    } else {
      probeErrorEvents += 1;
    }
    if (!postRestartConnected) {
      throw new Error(`post-restart websocket probe failed: ${postProbe?.reason ?? "unknown"}`);
    }

    await sleep(6_000);
    const postProbeStable = await openWsProbe(page, wsUrl);
    if (postProbeStable?.opened) {
      probeOpenEvents += 1;
      probeCloseEvents += 1;
    } else {
      probeErrorEvents += 1;
    }

    reconnectLoopDetected = !Boolean(postProbeStable?.opened);
    finalConnected = Boolean(postProbeStable?.opened);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    reconnectLoopDetected = true;
  } finally {
    await browser.close();
  }

  const completedAt = new Date().toISOString();
  const lines = [
    "# Restart WebSocket Stability Evidence",
    "",
    `- timestamp_utc: ${startedAt}`,
    "- source: browser",
    "- page_url: http://localhost:44285",
    `- ws_url: ${wsUrl}`,
    "- restart_command: docker compose restart oisin-ui",
    `- pre_restart_connected: ${yesNo(preRestartConnected)}`,
    `- post_restart_connected: ${yesNo(postRestartConnected)}`,
    `- reconnect_loop_detected: ${yesNo(reconnectLoopDetected)}`,
    `- websocket_open_events: ${probeOpenEvents}`,
    `- websocket_close_events: ${probeCloseEvents}`,
    `- websocket_error_events: ${probeErrorEvents}`,
    `- final_connected_state: ${yesNo(finalConnected)}`,
    `- error: ${error}`,
    `- completed_at_utc: ${completedAt}`,
  ];

  writeFileSync(wsStabilityPath, `${lines.join("\n")}\n`, "utf-8");

  if (!preRestartConnected || !postRestartConnected || reconnectLoopDetected) {
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const completedAt = new Date().toISOString();
  const lines = [
    "# Restart WebSocket Stability Evidence",
    "",
    `- timestamp_utc: ${new Date().toISOString()}`,
    "- source: browser",
    "- page_url: http://localhost:44285",
    "- ws_url: ws://localhost:6767/ws?clientSessionKey=restart-stability-browser",
    "- restart_command: docker compose restart oisin-ui",
    "- pre_restart_connected: no",
    "- post_restart_connected: no",
    "- reconnect_loop_detected: yes",
    "- websocket_open_events: 0",
    "- websocket_close_events: 0",
    "- websocket_error_events: 0",
    "- final_connected_state: no",
    `- error: ${message}`,
    `- completed_at_utc: ${completedAt}`,
  ];
  writeFileSync(wsStabilityPath, `${lines.join("\n")}\n`, "utf-8");
  process.exit(1);
});
NODE
probe_exit=$?
set -e

docker compose logs --no-color --timestamps oisin-ui > "$RESTART_LOGS"

if grep -q "Another Paseo daemon is already running" "$RESTART_LOGS"; then
  echo "Detected duplicate-daemon lock churn during restart" >&2
  exit 1
fi

if [[ "$probe_exit" -ne 0 ]]; then
  echo "Restart websocket stability probe failed" >&2
  exit 1
fi

if ! grep -q "pre_restart_connected: yes" "$WS_STABILITY"; then
  echo "Restart WS stability evidence missing pre-restart connected marker" >&2
  exit 1
fi

if ! grep -q "post_restart_connected: yes" "$WS_STABILITY"; then
  echo "Restart WS stability evidence missing post-restart connected marker" >&2
  exit 1
fi

if ! grep -q "reconnect_loop_detected: no" "$WS_STABILITY"; then
  echo "Restart WS stability evidence indicates reconnect loop" >&2
  exit 1
fi

echo "Restart stability gate passed"
