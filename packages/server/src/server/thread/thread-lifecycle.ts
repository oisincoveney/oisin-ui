import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import {
  createWorktree,
  deletePaseoWorktreeChecked,
  DirtyWorktreeError,
  getWorktreePorcelainStatus,
  runWorktreeSetupCommands,
  slugify,
} from "../../utils/worktree.js";
import type { ThreadLaunchConfig, ThreadRecord } from "./thread-registry.js";
import { ThreadRegistry } from "./thread-registry.js";

const execAsync = promisify(exec);
const READ_ONLY_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: "0",
};

export class ThreadLifecycleDirtyWorktreeError extends Error {
  readonly statusEntries: string[];

  constructor(worktreePath: string, statusEntries: string[]) {
    super(`Thread worktree has uncommitted changes: ${worktreePath}`);
    this.name = "ThreadLifecycleDirtyWorktreeError";
    this.statusEntries = [...statusEntries];
  }
}

type LoggerLike = {
  child(bindings: Record<string, unknown>): LoggerLike;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

type LifecycleDeps = {
  threadRegistry: ThreadRegistry;
  terminalManager: TerminalManager | null;
  agentManager: AgentManager;
  paseoHome: string;
  logger?: LoggerLike;
};

export type CreateThreadInput = {
  projectId: string;
  title: string;
  threadId?: string;
  baseBranch?: string;
  launchConfig: ThreadLaunchConfig;
};

export type DeleteThreadInput = {
  projectId: string;
  threadId: string;
  forceDirtyDelete?: boolean;
};

export type SwitchThreadInput = {
  projectId: string;
  threadId: string;
};

type CreateThreadResult = {
  thread: ThreadRecord;
  terminalId: string;
  sessionKey: string;
  worktreePath: string;
};

type ThreadLifecycleAdapters = {
  createWorktree: typeof createWorktree;
  deleteWorktreeChecked: typeof deletePaseoWorktreeChecked;
  getWorktreePorcelainStatus: typeof getWorktreePorcelainStatus;
  runWorktreeSetupCommands: typeof runWorktreeSetupCommands;
};

const DEFAULT_ADAPTERS: ThreadLifecycleAdapters = {
  createWorktree,
  deleteWorktreeChecked: deletePaseoWorktreeChecked,
  getWorktreePorcelainStatus,
  runWorktreeSetupCommands,
};

export class ThreadLifecycleService {
  private readonly threadRegistry: ThreadRegistry;
  private readonly terminalManager: TerminalManager | null;
  private readonly agentManager: AgentManager;
  private readonly paseoHome: string;
  private readonly logger?: LoggerLike;
  private readonly adapters: ThreadLifecycleAdapters;

  constructor(deps: LifecycleDeps, adapters: Partial<ThreadLifecycleAdapters> = {}) {
    this.threadRegistry = deps.threadRegistry;
    this.terminalManager = deps.terminalManager;
    this.agentManager = deps.agentManager;
    this.paseoHome = deps.paseoHome;
    this.logger = deps.logger?.child({ module: "thread-lifecycle" }) ?? undefined;
    this.adapters = {
      ...DEFAULT_ADAPTERS,
      ...adapters,
    };
  }

  async createThread(input: CreateThreadInput): Promise<CreateThreadResult> {
    const project = await this.threadRegistry.getProject(input.projectId);
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    if (!this.terminalManager) {
      throw new Error("Terminal manager not available");
    }

    const threadId = input.threadId?.trim() || this.createThreadIdFromTitle(input.title);
    const requestedBaseBranch = input.baseBranch?.trim();
    const baseBranch =
      requestedBaseBranch && requestedBaseBranch.length > 0
        ? requestedBaseBranch
        : project.defaultBaseBranch?.trim() || (await this.resolveCurrentBranch(project.repoRoot));
    const branchName = this.buildBranchName(input.title, threadId);

    let worktreePath: string | null = null;
    let sessionKey: string | null = null;
    let terminalId: string | null = null;

    try {
      const created = await this.adapters.createWorktree({
        branchName,
        cwd: project.repoRoot,
        baseBranch,
        worktreeSlug: slugify(threadId),
        paseoHome: this.paseoHome,
        runSetup: false,
      });
      worktreePath = created.worktreePath;

      const terminal = await this.ensureThreadTerminalWithRetry({
        projectId: project.projectId,
        threadId,
        cwd: worktreePath,
      });
      terminalId = terminal.terminal.id;
      sessionKey = terminal.sessionKey;

      const thread = await this.threadRegistry.createThread({
        projectId: project.projectId,
        threadId,
        title: input.title,
        launchConfig: input.launchConfig,
        links: {
          terminalId,
          agentId: null,
          worktreePath,
          sessionKey,
        },
        status: "idle",
      });

      return {
        thread,
        terminalId,
        sessionKey,
        worktreePath,
      };
    } catch (error) {
      await this.rollbackCreateThread({
        projectRepoRoot: project.repoRoot,
        worktreePath,
        sessionKey,
      });
      throw error;
    }
  }

  async startThreadProvisioning(input: { projectId: string; threadId: string }): Promise<ThreadRecord> {
    const thread = await this.threadRegistry.getThread(input.projectId, input.threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${input.projectId}/${input.threadId}`);
    }

    const worktreePath = thread.links.worktreePath;
    if (!worktreePath) {
      throw new Error(`Thread missing worktree path: ${input.projectId}/${input.threadId}`);
    }

    const branchName = await this.resolveCurrentBranch(worktreePath);

    await this.adapters.runWorktreeSetupCommands({
      worktreePath,
      branchName,
      cleanupOnFailure: false,
    });

    const providerExtra = thread.launchConfig.commandOverride
      ? {
          [thread.launchConfig.provider]: {
            commandOverride: thread.launchConfig.commandOverride,
          },
        }
      : undefined;

    const sessionConfig: AgentSessionConfig = {
      provider: thread.launchConfig.provider,
      cwd: worktreePath,
      ...(thread.launchConfig.modeId ? { modeId: thread.launchConfig.modeId } : {}),
      ...(providerExtra ? { extra: providerExtra as AgentSessionConfig["extra"] } : {}),
      title: thread.title,
    };

    const agent = await this.agentManager.createAgent(sessionConfig, undefined, {
      labels: {
        projectId: thread.projectId,
        threadId: thread.threadId,
      },
    });

    return await this.threadRegistry.updateThread({
      projectId: thread.projectId,
      threadId: thread.threadId,
      status: "running",
      links: {
        agentId: agent.id,
      },
    });
  }

  private async ensureThreadTerminalWithRetry(input: {
    projectId: string;
    threadId: string;
    cwd: string;
  }): Promise<{ terminal: { id: string }; sessionKey: string; cwd: string }> {
    if (!this.terminalManager) {
      throw new Error("Terminal manager unavailable");
    }
    const terminalManager = this.terminalManager;
    let lastError: unknown = null;
    const deriveThreadSessionKey = (terminalManager as {
      deriveThreadSessionKey?: (projectId: string, threadId: string) => string;
    }).deriveThreadSessionKey;
    const sessionKey =
      typeof deriveThreadSessionKey === "function"
        ? deriveThreadSessionKey(input.projectId, input.threadId)
        : null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await terminalManager.ensureThreadTerminal(input);
      } catch (error) {
        lastError = error;
        if (sessionKey) {
          try {
            terminalManager.killTerminalsBySessionKey(sessionKey);
          } catch {
            // no-op
          }
        }
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }
    throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
  }

  async switchThread(input: SwitchThreadInput): Promise<ThreadRecord> {
    await this.threadRegistry.switchThread(input.projectId, input.threadId);
    let thread = await this.threadRegistry.getThread(input.projectId, input.threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${input.projectId}/${input.threadId}`);
    }

    if (this.terminalManager && thread.links.worktreePath) {
      try {
        await access(thread.links.worktreePath);
      } catch {
        this.logger?.warn(
          {
            projectId: thread.projectId,
            threadId: thread.threadId,
            worktreePath: thread.links.worktreePath,
          },
          "Worktree path missing on disk - marking thread as error"
        );
        await this.threadRegistry.updateThreadStatus({
          projectId: thread.projectId,
          threadId: thread.threadId,
          status: "error",
        });
        throw new Error(`Worktree path no longer exists: ${thread.links.worktreePath}`);
      }
      const ensured = await this.ensureThreadTerminalWithRetry({
        projectId: thread.projectId,
        threadId: thread.threadId,
        cwd: thread.links.worktreePath,
      });
      if (
        ensured.terminal.id !== thread.links.terminalId ||
        ensured.sessionKey !== thread.links.sessionKey ||
        ensured.cwd !== thread.links.worktreePath
      ) {
        thread = await this.threadRegistry.updateThread({
          projectId: thread.projectId,
          threadId: thread.threadId,
          links: {
            terminalId: ensured.terminal.id,
            sessionKey: ensured.sessionKey,
            worktreePath: ensured.cwd,
          },
        });
      }
    }

    return thread;
  }

  async deleteThread(input: DeleteThreadInput): Promise<void> {
    const thread = await this.threadRegistry.getThread(input.projectId, input.threadId);
    if (!thread) {
      return;
    }

    const project = await this.threadRegistry.getProject(input.projectId);
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    const worktreePath = thread.links.worktreePath ?? null;
    if (worktreePath && !input.forceDirtyDelete) {
      const dirtyEntries = await this.adapters.getWorktreePorcelainStatus(worktreePath);
      if (dirtyEntries.length > 0) {
        throw new ThreadLifecycleDirtyWorktreeError(worktreePath, dirtyEntries);
      }
    }

    if (thread.links.agentId) {
      try {
        await this.agentManager.closeAgent(thread.links.agentId);
      } catch (error) {
        this.logger?.warn({ err: error, agentId: thread.links.agentId }, "Failed to close thread agent");
      }
    }

    if (this.terminalManager && thread.links.sessionKey) {
      this.terminalManager.killTerminalsBySessionKey(thread.links.sessionKey);
    }

    if (worktreePath) {
      try {
        await this.adapters.deleteWorktreeChecked({
          cwd: project.repoRoot,
          worktreePath,
          paseoHome: this.paseoHome,
          allowDirty: Boolean(input.forceDirtyDelete),
        });
      } catch (error) {
        if (error instanceof DirtyWorktreeError) {
          throw new ThreadLifecycleDirtyWorktreeError(worktreePath, error.statusEntries);
        }
        throw error;
      }
    }

    await this.threadRegistry.deleteThread(input.projectId, input.threadId);
  }

  private async rollbackCreateThread(input: {
    projectRepoRoot: string;
    worktreePath: string | null;
    sessionKey: string | null;
  }): Promise<void> {
    const rollbackErrors: string[] = [];

    if (this.terminalManager && input.sessionKey) {
      try {
        this.terminalManager.killTerminalsBySessionKey(input.sessionKey);
      } catch (error) {
        rollbackErrors.push(
          `terminal:${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (input.worktreePath) {
      try {
        await this.adapters.deleteWorktreeChecked({
          cwd: input.projectRepoRoot,
          worktreePath: input.worktreePath,
          paseoHome: this.paseoHome,
          allowDirty: true,
        });
      } catch (error) {
        rollbackErrors.push(
          `worktree:${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (rollbackErrors.length > 0) {
      this.logger?.error({ rollbackErrors }, "Thread create rollback completed with errors");
    }
  }

  private createThreadIdFromTitle(title: string): string {
    const base = slugify(title) || "thread";
    return `${base}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private buildBranchName(title: string, threadId: string): string {
    const branchBase = slugify(title) || "thread";
    const suffix = slugify(threadId).slice(0, 12) || "thread";
    return slugify(`${branchBase}-${suffix}`);
  }

  private async resolveCurrentBranch(repoRoot: string): Promise<string> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoRoot,
        env: READ_ONLY_GIT_ENV,
      });
      const branch = stdout.trim();
      if (branch && branch !== "HEAD") {
        return branch;
      }
    } catch {
      // no-op
    }
    return "main";
  }
}
