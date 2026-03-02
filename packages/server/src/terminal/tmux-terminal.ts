import * as pty from "node-pty";
import xterm, { type Terminal as TerminalType } from "@xterm/headless";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  ensureNodePtySpawnHelperExecutableForCurrentPlatform,
  type Cell,
  type ClientMessage,
  type CreateTerminalOptions,
  type ServerMessage,
  type TerminalRawChunk,
  type TerminalRawSubscriptionResult,
  type TerminalSession,
  type TerminalState,
} from "./terminal.js";

const { Terminal } = xterm;

function extractCell(terminal: TerminalType, row: number, col: number): Cell {
  const buffer = terminal.buffer.active;
  const line = buffer.getLine(row);
  if (!line) {
    return { char: " ", fg: undefined, bg: undefined };
  }

  const cell = line.getCell(col);
  if (!cell) {
    return { char: " ", fg: undefined, bg: undefined };
  }

  const fgModeRaw = cell.getFgColorMode();
  const bgModeRaw = cell.getBgColorMode();
  const fgMode = fgModeRaw >> 24;
  const bgMode = bgModeRaw >> 24;
  const fg = fgMode !== 0 ? cell.getFgColor() : undefined;
  const bg = bgMode !== 0 ? cell.getBgColor() : undefined;

  return {
    char: cell.getChars() || " ",
    fg,
    bg,
    fgMode: fgMode !== 0 ? fgMode : undefined,
    bgMode: bgMode !== 0 ? bgMode : undefined,
    bold: cell.isBold() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
  };
}

function extractGrid(terminal: TerminalType): Cell[][] {
  const grid: Cell[][] = [];
  const buffer = terminal.buffer.active;
  const baseY = buffer.baseY;
  for (let row = 0; row < terminal.rows; row++) {
    const rowCells: Cell[] = [];
    for (let col = 0; col < terminal.cols; col++) {
      rowCells.push(extractCell(terminal, baseY + row, col));
    }
    grid.push(rowCells);
  }
  return grid;
}

function extractScrollback(terminal: TerminalType): Cell[][] {
  const scrollback: Cell[][] = [];
  const buffer = terminal.buffer.active;
  const scrollbackLines = buffer.baseY;
  for (let row = 0; row < scrollbackLines; row++) {
    const rowCells: Cell[] = [];
    const line = buffer.getLine(row);
    for (let col = 0; col < terminal.cols; col++) {
      if (!line) {
        rowCells.push({ char: " ", fg: undefined, bg: undefined });
        continue;
      }
      const cell = line.getCell(col);
      if (!cell) {
        rowCells.push({ char: " ", fg: undefined, bg: undefined });
        continue;
      }
      const fgModeRaw = cell.getFgColorMode();
      const bgModeRaw = cell.getBgColorMode();
      const fgMode = fgModeRaw >> 24;
      const bgMode = bgModeRaw >> 24;
      const fg = fgMode !== 0 ? cell.getFgColor() : undefined;
      const bg = bgMode !== 0 ? cell.getBgColor() : undefined;
      rowCells.push({
        char: cell.getChars() || " ",
        fg,
        bg,
        fgMode: fgMode !== 0 ? fgMode : undefined,
        bgMode: bgMode !== 0 ? bgMode : undefined,
        bold: cell.isBold() !== 0,
        italic: cell.isItalic() !== 0,
        underline: cell.isUnderline() !== 0,
      });
    }
    scrollback.push(rowCells);
  }
  return scrollback;
}

function runTmux(args: string[], socketPath?: string): string {
  const tmuxArgs = socketPath ? ["-S", socketPath, ...args] : args;
  return execFileSync("tmux", tmuxArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

function ensureTmuxSession(options: {
  sessionName: string;
  cwd: string;
  agentCommand: string;
  env: Record<string, string>;
  socketPath?: string;
}): void {
  const envArgs = Object.entries(options.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

  const cwdExists = existsSync(options.cwd);
  if (!cwdExists) {
    try {
      runTmux(["kill-session", "-t", options.sessionName], options.socketPath);
    } catch {
      // no-op
    }
  }

  try {
    runTmux(["has-session", "-t", options.sessionName], options.socketPath);
  } catch {
    runTmux([
      "new-session",
      "-d",
      "-s",
      options.sessionName,
      "-c",
      options.cwd,
      ...envArgs,
      options.agentCommand,
    ], options.socketPath);
  }

  try {
    runTmux(["set-option", "-g", "base-index", "0"], options.socketPath);
    runTmux(["set-option", "-g", "pane-base-index", "0"], options.socketPath);
    runTmux(["set-option", "-t", options.sessionName, "status", "off"], options.socketPath);
    runTmux(["set-option", "-t", options.sessionName, "prefix", "C-a"], options.socketPath);
  } catch {
    // no-op
  }
}

function captureFullHistory(sessionName: string, socketPath?: string): string {
  try {
    return runTmux(["capture-pane", "-p", "-e", "-t", sessionName, "-S-", "-E-"], socketPath);
  } catch {
    return "";
  }
}

function byteLength(data: string): number {
  return Buffer.byteLength(data, "utf8");
}

function createEmptyGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ char: " ", fg: undefined, bg: undefined }))
  );
}

export async function createTmuxTerminalSession(
  options: CreateTerminalOptions & {
    sessionName: string;
    agentCommand: string;
    maxRawBufferBytes?: number;
    tmuxSocketPath?: string;
  }
): Promise<TerminalSession> {
  const {
    cwd,
    rows = 24,
    cols = 80,
    name = "Terminal",
    env = {},
    sessionName,
    agentCommand,
    maxRawBufferBytes = 256 * 1024,
    tmuxSocketPath,
  } = options;

  const launchCwd = existsSync(cwd) ? cwd : process.cwd();

  ensureTmuxSession({ sessionName, cwd: launchCwd, agentCommand, env, socketPath: tmuxSocketPath });

  const id = randomUUID();
  const listeners = new Set<(msg: ServerMessage) => void>();
  const rawListeners = new Set<(chunk: TerminalRawChunk) => void>();
  const exitListeners = new Set<() => void>();
  const rawOutputChunks: Array<{ startOffset: number; endOffset: number; data: string }> = [];

  let rawBufferBytes = 0;
  let outputOffset = 0;
  let killed = false;
  let disposed = false;
  let exitEmitted = false;
  let startupSettled = false;
  let resolveStartup: (() => void) | null = null;
  let rejectStartup: ((error: Error) => void) | null = null;
  const pendingStartupMessages: ClientMessage[] = [];
  let startupTimeout: NodeJS.Timeout | null = null;

  const startupReady = new Promise<void>((resolve, reject) => {
    resolveStartup = resolve;
    rejectStartup = reject;
  });

  function markStartupReady(): void {
    if (startupSettled) {
      return;
    }
    startupSettled = true;
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = null;
    }
    if (pendingStartupMessages.length > 0) {
      const queued = pendingStartupMessages.splice(0, pendingStartupMessages.length);
      for (const message of queued) {
        send(message);
      }
    }
    resolveStartup?.();
    resolveStartup = null;
    rejectStartup = null;
  }

  function markStartupFailed(error: Error): void {
    if (startupSettled) {
      return;
    }
    startupSettled = true;
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = null;
    }
    pendingStartupMessages.length = 0;
    rejectStartup?.(error);
    resolveStartup = null;
    rejectStartup = null;
  }

  const terminal = new Terminal({
    rows,
    cols,
    scrollback: 1000,
    allowProposedApi: true,
  });

  ensureNodePtySpawnHelperExecutableForCurrentPlatform();

  const ptyArgs = tmuxSocketPath 
    ? ["-S", tmuxSocketPath, "attach-session", "-t", sessionName]
    : ["attach-session", "-t", sessionName];

  const ptyProcess = pty.spawn("tmux", ptyArgs, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: launchCwd,
    env: {
      ...process.env,
      ...env,
      TERM: "xterm-256color",
    },
  });

  const ptyEmitter = ptyProcess as unknown as {
    on(event: "error", listener: (error: NodeJS.ErrnoException) => void): void;
  };

  ptyEmitter.on("error", (error) => {
    const code = error?.code;
    if (code === "ENXIO" || code === "EIO" || code === "EBADF") {
      return;
    }
    if (killed || disposed) {
      return;
    }

    if (!startupSettled) {
      markStartupFailed(error instanceof Error ? error : new Error(String(error)));
    }
    killed = true;
    emitExit();
    disposeResources();
  });

  function emitExit(): void {
    if (exitEmitted) {
      return;
    }
    exitEmitted = true;
    for (const listener of Array.from(exitListeners)) {
      try {
        listener();
      } catch {
        // no-op
      }
    }
    exitListeners.clear();
  }

  function disposeResources(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    terminal.dispose();
    listeners.clear();
    rawListeners.clear();
    exitListeners.clear();
  }

  function appendRawOutputChunk(data: string): void {
    const chunkBytes = byteLength(data);
    if (chunkBytes <= 0) {
      return;
    }

    const startOffset = outputOffset;
    const endOffset = startOffset + chunkBytes;
    outputOffset = endOffset;

    rawOutputChunks.push({ startOffset, endOffset, data });
    rawBufferBytes += chunkBytes;

    while (rawBufferBytes > maxRawBufferBytes && rawOutputChunks.length > 0) {
      const removed = rawOutputChunks.shift();
      if (!removed) {
        break;
      }
      rawBufferBytes -= removed.endOffset - removed.startOffset;
    }

    const chunk: TerminalRawChunk = {
      data,
      startOffset,
      endOffset,
      replay: false,
    };
    for (const listener of rawListeners) {
      listener(chunk);
    }
  }

  function getEarliestAvailableOffset(): number {
    const earliest = rawOutputChunks[0];
    return earliest ? earliest.startOffset : outputOffset;
  }

  function alignOffsetToChunkBoundary(offset: number): number {
    if (offset === outputOffset) {
      return offset;
    }
    for (const chunk of rawOutputChunks) {
      if (offset === chunk.startOffset || offset === chunk.endOffset) {
        return offset;
      }
      if (offset > chunk.startOffset && offset < chunk.endOffset) {
        return chunk.startOffset;
      }
    }
    return offset;
  }

  function emitStateSnapshot(): void {
    if (disposed) {
      return;
    }
    const state = getState();
    for (const listener of listeners) {
      listener({ type: "full", state });
    }
  }

  ptyProcess.onData((data) => {
    if (killed) {
      return;
    }
    markStartupReady();
    appendRawOutputChunk(data);
    terminal.write(data, () => emitStateSnapshot());
  });

  ptyProcess.onExit(() => {
    if (!killed) {
      markStartupFailed(new Error("tmux attach exited during startup"));
    }
    killed = true;
    emitExit();
    disposeResources();
  });

  function getState(): TerminalState {
    if (disposed) {
      return {
        rows,
        cols,
        grid: createEmptyGrid(rows, cols),
        scrollback: [],
        cursor: {
          row: 0,
          col: 0,
        },
      };
    }
    return {
      rows: terminal.rows,
      cols: terminal.cols,
      grid: extractGrid(terminal),
      scrollback: extractScrollback(terminal),
      cursor: {
        row: terminal.buffer.active.cursorY,
        col: terminal.buffer.active.cursorX,
      },
    };
  }

  function send(msg: ClientMessage): void {
    if (killed) {
      return;
    }

    if (!startupSettled) {
      pendingStartupMessages.push(msg);
      return;
    }

    try {
      switch (msg.type) {
        case "input":
          ptyProcess.write(msg.data);
          break;
        case "resize":
          terminal.resize(msg.cols, msg.rows);
          ptyProcess.resize(msg.cols, msg.rows);
          break;
        case "mouse":
          break;
      }
    } catch {
      killed = true;
      pendingStartupMessages.length = 0;
      emitExit();
      disposeResources();
    }
  }

  function subscribe(listener: (msg: ServerMessage) => void): () => void {
    listeners.add(listener);
    queueMicrotask(() => {
      if (listeners.has(listener)) {
        listener({ type: "full", state: getState() });
      }
    });
    return () => {
      listeners.delete(listener);
    };
  }

  function onExit(listener: () => void): () => void {
    if (killed) {
      queueMicrotask(() => {
        try {
          listener();
        } catch {
          // no-op
        }
      });
      return () => {};
    }
    exitListeners.add(listener);
    return () => {
      exitListeners.delete(listener);
    };
  }

  function subscribeRaw(
    listener: (chunk: TerminalRawChunk) => void,
    rawOptions?: { fromOffset?: number }
  ): TerminalRawSubscriptionResult {
    const requestedOffset = Math.max(0, Math.floor(rawOptions?.fromOffset ?? 0));
    const earliestAvailableOffset = getEarliestAvailableOffset();

    if (requestedOffset < earliestAvailableOffset || requestedOffset === 0) {
      const snapshot = captureFullHistory(sessionName, tmuxSocketPath);
      const snapshotBytes = byteLength(snapshot);
      const currentOffset = outputOffset;
      const replayedFrom = Math.max(0, currentOffset - snapshotBytes);

      if (snapshot.length > 0) {
        listener({
          data: snapshot,
          startOffset: replayedFrom,
          endOffset: currentOffset,
          replay: true,
        });
      }

      rawListeners.add(listener);
      return {
        unsubscribe: () => {
          rawListeners.delete(listener);
        },
        replayedFrom,
        currentOffset,
        earliestAvailableOffset,
        reset: replayedFrom !== requestedOffset,
      };
    }

    const clampedOffset = Math.max(requestedOffset, earliestAvailableOffset);
    const replayedFrom = alignOffsetToChunkBoundary(clampedOffset);
    const reset = replayedFrom !== requestedOffset;

    for (const chunk of rawOutputChunks) {
      if (chunk.endOffset <= replayedFrom) {
        continue;
      }
      listener({
        data: chunk.data,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        replay: true,
      });
    }

    rawListeners.add(listener);
    return {
      unsubscribe: () => {
        rawListeners.delete(listener);
      },
      replayedFrom,
      currentOffset: outputOffset,
      earliestAvailableOffset,
      reset,
    };
  }

  function getOutputOffset(): number {
    return outputOffset;
  }

  function kill(): void {
    if (killed) {
      disposeResources();
      return;
    }
    killed = true;
    try {
      runTmux(["kill-session", "-t", sessionName], tmuxSocketPath);
    } catch {
      // no-op
    }
    ptyProcess.kill();
    emitExit();
    disposeResources();
  }

  startupTimeout = setTimeout(() => {
    markStartupReady();
  }, 1000);

  await startupReady;

  return {
    id,
    name,
    cwd,
    send,
    subscribe,
    onExit,
    subscribeRaw,
    getOutputOffset,
    getState,
    kill,
  };
}
