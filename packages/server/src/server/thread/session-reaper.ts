import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { ManagedAgent } from "../agent/agent-manager.js";
import { deletePaseoWorktreeChecked, listPaseoWorktrees } from "../../utils/worktree.js";
import { ThreadRegistry, type ThreadRecord } from "./thread-registry.js";

const execFileAsync = promisify(execFile);

const DEFAULT_REAPER_INTERVAL_MS = 5 * 60 * 1000;

type ReaperLogger = {
  child(bindings: Record<string, unknown>): ReaperLogger;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

type TmuxSessionSnapshot = {
  sessionKey: string;
  cwd: string | null;
};

type ReaperAdapters = {
  listAgents: () => ManagedAgent[];
  closeAgent: (agentId: string) => Promise<void>;
  listTmuxSessions: (tmuxSocketPath?: string) => Promise<TmuxSessionSnapshot[]>;
  killTmuxSession: (sessionKey: string, tmuxSocketPath?: string) => void;
  listProjectWorktrees: (repoRoot: string, paseoHome: string) => Promise<string[]>;
  deleteWorktree: (repoRoot: string, worktreePath: string, paseoHome: string) => Promise<void>;
};

type SessionReaperOptions = {
  threadRegistry: ThreadRegistry;
  paseoHome: string;
  agentManager: {
    listAgents(): ManagedAgent[];
    closeAgent(agentId: string): Promise<void>;
  };
  logger?: ReaperLogger;
  intervalMs?: number;
  tmuxSocketPath?: string;
};

function normalizePath(input: string): string {
  return path.resolve(input);
}

function pathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedCandidate = normalizePath(candidatePath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function defaultListTmuxSessions(tmuxSocketPath?: string): Promise<TmuxSessionSnapshot[]> {
  const args = tmuxSocketPath
    ? ["-S", tmuxSocketPath, "list-panes", "-a", "-F", "#{session_name}\t#{pane_current_path}"]
    : ["list-panes", "-a", "-F", "#{session_name}\t#{pane_current_path}"];

  try {
    const { stdout } = await execFileAsync("tmux", args, {
      encoding: "utf8",
      env: process.env,
    });
    const sessions = new Map<string, TmuxSessionSnapshot>();
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [sessionKeyRaw, panePathRaw] = trimmed.split("\t");
      const sessionKey = sessionKeyRaw?.trim();
      if (!sessionKey) {
        continue;
      }
      if (sessions.has(sessionKey)) {
        continue;
      }
      const panePath = panePathRaw?.trim();
      sessions.set(sessionKey, {
        sessionKey,
        cwd: panePath ? normalizePath(panePath) : null,
      });
    }
    return [...sessions.values()];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    if (code === "ENOENT" || stderr.includes("no server running")) {
      return [];
    }
    throw error;
  }
}

function defaultKillTmuxSession(sessionKey: string, tmuxSocketPath?: string): void {
  const args = tmuxSocketPath
    ? ["-S", tmuxSocketPath, "kill-session", "-t", sessionKey]
    : ["kill-session", "-t", sessionKey];
  try {
    execFile("tmux", args, { env: process.env }, () => {});
  } catch {
    // no-op
  }
}

async function defaultListProjectWorktrees(repoRoot: string, paseoHome: string): Promise<string[]> {
  const worktrees = await listPaseoWorktrees({
    cwd: repoRoot,
    paseoHome,
  });
  return worktrees.map((entry) => normalizePath(entry.path));
}

async function defaultDeleteWorktree(repoRoot: string, worktreePath: string, paseoHome: string): Promise<void> {
  await deletePaseoWorktreeChecked({
    cwd: repoRoot,
    worktreePath,
    paseoHome,
    allowDirty: true,
  });
}

function threadKey(thread: Pick<ThreadRecord, "projectId" | "threadId">): string {
  return `${thread.projectId}:${thread.threadId}`;
}

export class ThreadSessionReaper {
  private readonly threadRegistry: ThreadRegistry;
  private readonly paseoHome: string;
  private readonly logger?: ReaperLogger;
  private readonly intervalMs: number;
  private readonly tmuxSocketPath?: string;
  private readonly adapters: ReaperAdapters;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: SessionReaperOptions, overrides: Partial<ReaperAdapters> = {}) {
    this.threadRegistry = options.threadRegistry;
    this.paseoHome = normalizePath(options.paseoHome);
    this.logger = options.logger?.child({ module: "thread-session-reaper" }) ?? undefined;
    this.intervalMs = options.intervalMs ?? DEFAULT_REAPER_INTERVAL_MS;
    this.tmuxSocketPath = options.tmuxSocketPath;
    this.adapters = {
      listAgents: () => options.agentManager.listAgents(),
      closeAgent: (agentId: string) => options.agentManager.closeAgent(agentId),
      listTmuxSessions: defaultListTmuxSessions,
      killTmuxSession: defaultKillTmuxSession,
      listProjectWorktrees: defaultListProjectWorktrees,
      deleteWorktree: defaultDeleteWorktree,
      ...overrides,
    };
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }
    await this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => {
        this.logger?.warn({ err: error }, "Thread session reaper run failed");
      });
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    await this.threadRegistry.load();
    const snapshot = this.threadRegistry.getSnapshot();
    const threads = snapshot.threads;
    const trackedThreadKeys = new Set(threads.map((thread) => threadKey(thread)));
    const trackedSessionKeys = new Set(
      threads
        .map((thread) => thread.links.sessionKey)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const trackedWorktreePaths = new Set(
      threads
        .map((thread) => thread.links.worktreePath)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((worktreePath) => normalizePath(worktreePath))
    );
    const trackedAgentIds = new Set(
      threads
        .map((thread) => thread.links.agentId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const projectRepoRoots = new Map(
      snapshot.projects.map((project) => [project.projectId, normalizePath(project.repoRoot)])
    );

    const tmuxSessions = await this.adapters.listTmuxSessions(this.tmuxSocketPath);
    const liveSessionKeys = new Set(tmuxSessions.map((session) => session.sessionKey));

    const worktreesByProject = new Map<string, Set<string>>();
    for (const project of snapshot.projects) {
      const projectRoot = normalizePath(project.repoRoot);
      const projectWorktrees = await this.adapters.listProjectWorktrees(projectRoot, this.paseoHome);
      worktreesByProject.set(project.projectId, new Set(projectWorktrees.map((entry) => normalizePath(entry))));
    }

    const liveWorktrees = new Set<string>();
    for (const paths of worktreesByProject.values()) {
      for (const entry of paths) {
        liveWorktrees.add(entry);
      }
    }

    const agents = this.adapters.listAgents();
    const liveAgentIds = new Set(agents.map((agent) => agent.id));

    for (const thread of threads) {
      const details = {
        projectId: thread.projectId,
        threadId: thread.threadId,
        sessionKey: thread.links.sessionKey ?? null,
        worktreePath: thread.links.worktreePath ?? null,
        agentId: thread.links.agentId ?? null,
      };

      if (thread.links.sessionKey && !liveSessionKeys.has(thread.links.sessionKey)) {
        this.logger?.info({ event: "thread_registry_drift", drift: "missing_tmux_session", ...details }, "Detected thread registry drift");
      }
      if (thread.links.worktreePath) {
        const normalizedWorktreePath = normalizePath(thread.links.worktreePath);
        if (!liveWorktrees.has(normalizedWorktreePath)) {
          this.logger?.info({ event: "thread_registry_drift", drift: "missing_worktree", ...details }, "Detected thread registry drift");
        }
      }
      if (thread.links.agentId && !liveAgentIds.has(thread.links.agentId)) {
        this.logger?.info({ event: "thread_registry_drift", drift: "missing_agent", ...details }, "Detected thread registry drift");
      }
    }

    for (const agent of agents) {
      if (trackedAgentIds.has(agent.id)) {
        continue;
      }

      const labeledProjectId = agent.labels?.projectId;
      const labeledThreadId = agent.labels?.threadId;
      const hasThreadLabels =
        typeof labeledProjectId === "string" && labeledProjectId.length > 0 &&
        typeof labeledThreadId === "string" && labeledThreadId.length > 0;

      const isLabeledAsUnknownThread =
        hasThreadLabels && !trackedThreadKeys.has(`${labeledProjectId}:${labeledThreadId}`);
      const isInsidePaseoWorktree = pathWithinRoot(agent.cwd, path.join(this.paseoHome, "worktrees"));

      if (!isLabeledAsUnknownThread && !isInsidePaseoWorktree) {
        continue;
      }

      try {
        await this.adapters.closeAgent(agent.id);
        this.logger?.info(
          {
            event: "thread_orphan_cleanup",
            resource: "agent",
            agentId: agent.id,
            cwd: agent.cwd,
            labels: agent.labels,
          },
          "Closed orphaned thread agent"
        );
      } catch (error) {
        this.logger?.warn({ err: error, agentId: agent.id }, "Failed to close orphaned agent");
      }
    }

    for (const session of tmuxSessions) {
      if (trackedSessionKeys.has(session.sessionKey)) {
        continue;
      }

      const hasPaseoPrefix = session.sessionKey.startsWith("oisin-");
      const hasPaseoWorktreePath = session.cwd
        ? pathWithinRoot(session.cwd, path.join(this.paseoHome, "worktrees"))
        : false;
      if (!hasPaseoPrefix || !hasPaseoWorktreePath) {
        continue;
      }

      this.adapters.killTmuxSession(session.sessionKey, this.tmuxSocketPath);
      this.logger?.info(
        {
          event: "thread_orphan_cleanup",
          resource: "tmux_session",
          sessionKey: session.sessionKey,
          cwd: session.cwd,
        },
        "Killed orphaned tmux session"
      );
    }

    for (const threadProject of snapshot.projects) {
      const repoRoot = projectRepoRoots.get(threadProject.projectId);
      const projectWorktrees = worktreesByProject.get(threadProject.projectId);
      if (!repoRoot || !projectWorktrees) {
        continue;
      }

      for (const worktreePath of projectWorktrees.values()) {
        if (trackedWorktreePaths.has(worktreePath)) {
          continue;
        }
        if (!pathWithinRoot(worktreePath, path.join(this.paseoHome, "worktrees"))) {
          continue;
        }

        try {
          await this.adapters.deleteWorktree(repoRoot, worktreePath, this.paseoHome);
          this.logger?.info(
            {
              event: "thread_orphan_cleanup",
              resource: "worktree",
              worktreePath,
              repoRoot,
            },
            "Deleted orphaned worktree"
          );
        } catch (error) {
          this.logger?.warn(
            {
              err: error,
              worktreePath,
              repoRoot,
            },
            "Failed to delete orphaned worktree"
          );
        }
      }
    }
  }
}
