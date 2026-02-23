import { resolve, sep, basename } from "node:path";
import { createTmuxTerminalSession } from "./tmux-terminal.js";
import type { TerminalSession } from "./terminal.js";

export interface TerminalListItem {
  id: string;
  name: string;
  cwd: string;
}

export interface TerminalsChangedEvent {
  cwd: string;
  terminals: TerminalListItem[];
}

export type TerminalsChangedListener = (input: TerminalsChangedEvent) => void;

export interface TerminalManager {
  getTerminals(cwd: string): Promise<TerminalSession[]>;
  createTerminal(options: {
    cwd: string;
    name?: string;
    env?: Record<string, string>;
  }): Promise<TerminalSession>;
  registerCwdEnv(options: { cwd: string; env: Record<string, string> }): void;
  getTerminal(id: string): TerminalSession | undefined;
  killTerminal(id: string): void;
  listDirectories(): string[];
  killAll(): void;
  subscribeTerminalsChanged(listener: TerminalsChangedListener): () => void;
  ensureDefaultTerminal(): Promise<{
    terminal: TerminalSession;
    threadId: "active";
    threadScope: "phase2-active-thread-placeholder";
    sessionKey: string;
    cwd: string;
  }>;
}

type TerminalManagerOptions = {
  defaultTerminalCwd?: string;
  defaultTerminalAgentCommand?: string;
  tmuxSocketPath?: string;
};

const DEFAULT_MAX_RAW_BUFFER_BYTES = 64 * 1024;

function sanitizeTmuxSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "project";
}

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function deriveSessionKeyForCwd(cwd: string): string {
  const normalized = resolve(cwd);
  const leaf = sanitizeTmuxSegment(basename(normalized));
  const hash = shortHash(normalized);
  return `oisin-${leaf}-${hash}`;
}

function deriveDefaultSessionKey(cwd: string): string {
  return `${deriveSessionKeyForCwd(cwd)}-active`;
}

export function createTerminalManager(options: TerminalManagerOptions = {}): TerminalManager {
  const terminalsByCwd = new Map<string, TerminalSession[]>();
  const terminalsById = new Map<string, TerminalSession>();
  const terminalExitUnsubscribeById = new Map<string, () => void>();
  const terminalsChangedListeners = new Set<TerminalsChangedListener>();
  const defaultEnvByRootCwd = new Map<string, Record<string, string>>();
  const sessionNameByTerminalId = new Map<string, string>();
  let defaultTerminalId: string | null = null;
  const defaultTerminalCwd = resolve(options.defaultTerminalCwd ?? process.cwd());
  const defaultTerminalAgentCommand =
    options.defaultTerminalAgentCommand?.trim().length
      ? options.defaultTerminalAgentCommand.trim()
      : "opencode";
  const defaultShellPath = (process.env.SHELL?.trim() || "/bin/bash").split(/\s+/)[0] ?? "/bin/bash";
  const defaultShellCommand = `${defaultShellPath} -i`;
  const defaultTerminalName = "Terminal 1";
  let ensureDefaultTerminalInFlight: Promise<{
    terminal: TerminalSession;
    threadId: "active";
    threadScope: "phase2-active-thread-placeholder";
    sessionKey: string;
    cwd: string;
  }> | null = null;

  function assertAbsolutePath(cwd: string): void {
    if (!cwd.startsWith("/")) {
      throw new Error("cwd must be absolute path");
    }
  }

  function removeSessionById(id: string, options: { kill: boolean }): void {
    const session = terminalsById.get(id);
    if (!session) {
      return;
    }

    const unsubscribeExit = terminalExitUnsubscribeById.get(id);
    if (unsubscribeExit) {
      unsubscribeExit();
      terminalExitUnsubscribeById.delete(id);
    }

    terminalsById.delete(id);
    sessionNameByTerminalId.delete(id);
    if (defaultTerminalId === id) {
      defaultTerminalId = null;
    }

    const terminals = terminalsByCwd.get(session.cwd);
    if (terminals) {
      const index = terminals.findIndex((terminal) => terminal.id === id);
      if (index !== -1) {
        terminals.splice(index, 1);
      }
      if (terminals.length === 0) {
        terminalsByCwd.delete(session.cwd);
      }
    }

    if (options.kill) {
      session.kill();
    }

    emitTerminalsChanged({ cwd: session.cwd });
  }

  function resolveDefaultEnvForCwd(cwd: string): Record<string, string> | undefined {
    const normalizedCwd = resolve(cwd);
    let bestMatchRoot: string | null = null;

    for (const rootCwd of defaultEnvByRootCwd.keys()) {
      const matches = normalizedCwd === rootCwd || normalizedCwd.startsWith(`${rootCwd}${sep}`);
      if (!matches) {
        continue;
      }
      if (!bestMatchRoot || rootCwd.length > bestMatchRoot.length) {
        bestMatchRoot = rootCwd;
      }
    }

    return bestMatchRoot ? defaultEnvByRootCwd.get(bestMatchRoot) : undefined;
  }

  function registerSession(session: TerminalSession): TerminalSession {
    terminalsById.set(session.id, session);
    const unsubscribeExit = session.onExit(() => {
      removeSessionById(session.id, { kill: false });
    });
    terminalExitUnsubscribeById.set(session.id, unsubscribeExit);
    return session;
  }

  function getLiveTerminalsForCwd(cwd: string): TerminalSession[] {
    const terminals = terminalsByCwd.get(cwd) ?? [];
    const live = terminals.filter((terminal) => terminalsById.has(terminal.id));
    if (live.length === 0) {
      terminalsByCwd.delete(cwd);
      return [];
    }
    if (live.length !== terminals.length) {
      terminalsByCwd.set(cwd, live);
      return live;
    }
    return terminals;
  }

  async function createManagedTerminal(options: {
    cwd: string;
    name: string;
    env?: Record<string, string>;
    sessionName: string;
    agentCommand?: string;
    tmuxSocketPath?: string;
  }): Promise<TerminalSession> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = registerSession(
        await createTmuxTerminalSession({
          cwd: options.cwd,
          name: options.name,
          ...(options.env ? { env: options.env } : {}),
          sessionName: options.sessionName,
          agentCommand: options.agentCommand ?? defaultShellCommand,
          maxRawBufferBytes: DEFAULT_MAX_RAW_BUFFER_BYTES,
          tmuxSocketPath: options.tmuxSocketPath,
        })
      );
      sessionNameByTerminalId.set(session.id, options.sessionName);
      if (terminalsById.has(session.id)) {
        return session;
      }
    }
    throw new Error("Terminal exited during startup");
  }

  function toTerminalListItem(input: { session: TerminalSession }): TerminalListItem {
    return {
      id: input.session.id,
      name: input.session.name,
      cwd: input.session.cwd,
    };
  }

  function emitTerminalsChanged(input: { cwd: string }): void {
    if (terminalsChangedListeners.size === 0) {
      return;
    }

    const terminals = (terminalsByCwd.get(input.cwd) ?? []).map((session) =>
      toTerminalListItem({ session })
    );
    const event: TerminalsChangedEvent = {
      cwd: input.cwd,
      terminals,
    };

    for (const listener of terminalsChangedListeners) {
      try {
        listener(event);
      } catch {
        // no-op
      }
    }
  }

  return {
    async getTerminals(cwd: string): Promise<TerminalSession[]> {
      assertAbsolutePath(cwd);

      let terminals = getLiveTerminalsForCwd(cwd);
      if (!terminals || terminals.length === 0) {
        const inheritedEnv = resolveDefaultEnvForCwd(cwd);
        const session = await createManagedTerminal({
          cwd,
          name: defaultTerminalName,
          ...(inheritedEnv ? { env: inheritedEnv } : {}),
          sessionName: `${deriveSessionKeyForCwd(cwd)}-term-1`,
          agentCommand: defaultShellCommand,
          tmuxSocketPath: options.tmuxSocketPath,
        });
        terminals = [session];
        terminalsByCwd.set(cwd, terminals);
        emitTerminalsChanged({ cwd });
      }
      return terminals;
    },

    async createTerminal(options: {
      cwd: string;
      name?: string;
      env?: Record<string, string>;
      tmuxSocketPath?: string;
    }): Promise<TerminalSession> {
      assertAbsolutePath(options.cwd);

      const terminals = getLiveTerminalsForCwd(options.cwd);
      const defaultName = `Terminal ${terminals.length + 1}`;
      const inheritedEnv = resolveDefaultEnvForCwd(options.cwd);
      const mergedEnv =
        inheritedEnv || options.env
          ? { ...inheritedEnv, ...options.env }
          : undefined;
      const session = await createManagedTerminal({
        cwd: options.cwd,
        name: options.name ?? defaultName,
        ...(mergedEnv ? { env: mergedEnv } : {}),
        sessionName: `${deriveSessionKeyForCwd(options.cwd)}-term-${terminals.length + 1}`,
        agentCommand: defaultShellCommand,
        tmuxSocketPath: options.tmuxSocketPath,
      });

      terminals.push(session);
      terminalsByCwd.set(options.cwd, terminals);
      emitTerminalsChanged({ cwd: options.cwd });

      return session;
    },

    registerCwdEnv(options: { cwd: string; env: Record<string, string> }): void {
      assertAbsolutePath(options.cwd);
      defaultEnvByRootCwd.set(resolve(options.cwd), { ...options.env });
    },

    getTerminal(id: string): TerminalSession | undefined {
      return terminalsById.get(id);
    },

    killTerminal(id: string): void {
      removeSessionById(id, { kill: true });
    },

    listDirectories(): string[] {
      return Array.from(terminalsByCwd.keys());
    },

    killAll(): void {
      for (const id of Array.from(terminalsById.keys())) {
        removeSessionById(id, { kill: true });
      }
    },

    subscribeTerminalsChanged(listener: TerminalsChangedListener): () => void {
      terminalsChangedListeners.add(listener);
      return () => {
        terminalsChangedListeners.delete(listener);
      };
    },

    async ensureDefaultTerminal(): Promise<{
      terminal: TerminalSession;
      threadId: "active";
      threadScope: "phase2-active-thread-placeholder";
      sessionKey: string;
      cwd: string;
    }> {
      if (ensureDefaultTerminalInFlight) {
        return ensureDefaultTerminalInFlight;
      }

      const inFlight = (async () => {
        let terminal = defaultTerminalId ? terminalsById.get(defaultTerminalId) : undefined;
        if (!terminal) {
          const inheritedEnv = resolveDefaultEnvForCwd(defaultTerminalCwd);
          terminal = await createManagedTerminal({
            cwd: defaultTerminalCwd,
            name: defaultTerminalName,
            ...(inheritedEnv ? { env: inheritedEnv } : {}),
            sessionName: deriveDefaultSessionKey(defaultTerminalCwd),
            agentCommand: defaultTerminalAgentCommand,
            tmuxSocketPath: options.tmuxSocketPath,
          });
          const terminals = terminalsByCwd.get(defaultTerminalCwd) ?? [];
          terminals.unshift(terminal);
          terminalsByCwd.set(defaultTerminalCwd, terminals);
          defaultTerminalId = terminal.id;
          emitTerminalsChanged({ cwd: defaultTerminalCwd });
        }
        const sessionKey =
          sessionNameByTerminalId.get(terminal.id) ?? deriveDefaultSessionKey(defaultTerminalCwd);
        return {
          terminal,
          threadId: "active" as const,
          threadScope: "phase2-active-thread-placeholder" as const,
          sessionKey,
          cwd: defaultTerminalCwd,
        };
      })();

      ensureDefaultTerminalInFlight = inFlight;
      try {
        return await inFlight;
      } finally {
        if (ensureDefaultTerminalInFlight === inFlight) {
          ensureDefaultTerminalInFlight = null;
        }
      }
    },
  };
}
