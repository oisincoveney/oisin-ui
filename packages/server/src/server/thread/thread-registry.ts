import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import { AgentProviderSchema } from "../agent/provider-manifest.js";
import { ProviderCommandSchema } from "../agent/provider-launch-config.js";
import { getDb, initDb, type DbHandle } from "./db.js";

const THREAD_REGISTRY_DB_FILENAME = "thread-registry.sqlite";

const ThreadStatusSchema = z.enum(["idle", "running", "error", "closed"]);

const ThreadLaunchConfigSchema = z
  .object({
    provider: AgentProviderSchema,
    modeId: z.string().trim().min(1).nullable().optional(),
    commandOverride: ProviderCommandSchema.optional(),
  })
  .strict();

const ThreadLinksSchema = z
  .object({
    terminalId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    worktreePath: z.string().trim().min(1).nullable().optional(),
    sessionKey: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const ProjectRecordSchema = z
  .object({
    projectId: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    repoRoot: z.string().trim().min(1),
    defaultBaseBranch: z.string().trim().min(1).nullable().optional(),
    activeThreadId: z.string().trim().min(1).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const ThreadRecordSchema = z
  .object({
    projectId: z.string().trim().min(1),
    threadId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    status: ThreadStatusSchema,
    unreadCount: z.number().int().nonnegative(),
    launchConfig: ThreadLaunchConfigSchema,
    links: ThreadLinksSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    lastActiveAt: z.string().nullable().optional(),
    lastOutputAt: z.string().nullable().optional(),
    lastStatusAt: z.string().nullable().optional(),
  })
  .strict();

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;
export type ThreadLaunchConfig = z.infer<typeof ThreadLaunchConfigSchema>;
export type ThreadLinks = z.infer<typeof ThreadLinksSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type ThreadRecord = z.infer<typeof ThreadRecordSchema>;
export type ThreadRegistryState = {
  version: number;
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  active: {
    projectId: string | null;
    threadId: string | null;
  };
  compatibility?: {
    placeholderThreadId: string;
    placeholderThreadScope: string;
    seededProjectId: string;
    seededThreadId: string;
    seededAt: string;
  };
  updatedAt: string;
};

type ThreadRegistryLogger = {
  child(bindings: Record<string, unknown>): ThreadRegistryLogger;
  info(...args: any[]): void;
  warn(...args: any[]): void;
};

type ProjectRow = {
  project_id: string;
  display_name: string;
  repo_root: string;
  default_base_branch: string | null;
  active_thread_id: string | null;
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  project_id: string;
  thread_id: string;
  title: string;
  status: ThreadStatus;
  unread_count: number;
  worktree_path: string;
  terminal_id: string | null;
  launch_config: string;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
  last_output_at: string | null;
  last_status_at: string | null;
};

const DEFAULT_LAUNCH_CONFIG: ThreadLaunchConfig = {
  provider: "opencode",
};

function getDefaultRegistryState(nowIso: string): ThreadRegistryState {
  return {
    version: 1,
    projects: [],
    threads: [],
    active: {
      projectId: null,
      threadId: null,
    },
    updatedAt: nowIso,
  };
}

function normalizeState(state: ThreadRegistryState): ThreadRegistryState {
  return {
    ...state,
    projects: [...state.projects].sort((a, b) => a.projectId.localeCompare(b.projectId)),
    threads: [...state.threads].sort((a, b) => {
      const projectCompare = a.projectId.localeCompare(b.projectId);
      if (projectCompare !== 0) {
        return projectCompare;
      }
      return a.threadId.localeCompare(b.threadId);
    }),
  };
}

function threadKey(projectId: string, threadId: string): string {
  return `${projectId}\u0000${threadId}`;
}

function parseThreadKey(key: string): { projectId: string; threadId: string } | null {
  const separatorIndex = key.indexOf("\u0000");
  if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
    return null;
  }
  return {
    projectId: key.slice(0, separatorIndex),
    threadId: key.slice(separatorIndex + 1),
  };
}

export class ThreadRegistry {
  private readonly dbPath: string;
  private readonly logger?: ThreadRegistryLogger;
  private state: ThreadRegistryState;
  private loaded = false;
  private db: DbHandle | null = null;
  private readonly threadAgentIds = new Map<string, string>();
  private readonly threadSessionKeys = new Map<string, string>();

  constructor(paseoHome: string, logger?: ThreadRegistryLogger) {
    this.dbPath = path.join(paseoHome, THREAD_REGISTRY_DB_FILENAME);
    this.logger = logger?.child({ module: "thread-registry" }) ?? undefined;
    this.state = getDefaultRegistryState(new Date().toISOString());
  }

  async load(): Promise<ThreadRegistryState> {
    if (!this.loaded) {
      this.db = await initDb(this.dbPath);
      this.loaded = true;
      this.logger?.info({ dbPath: this.dbPath }, "Initialized thread registry database");
    }

    await this.refreshStateFromDb();
    return this.getSnapshot();
  }

  getSnapshot(): ThreadRegistryState {
    return normalizeState(JSON.parse(JSON.stringify(this.state)) as ThreadRegistryState);
  }

  async listProjects(): Promise<ProjectRecord[]> {
    await this.load();
    return this.getSnapshot().projects;
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    await this.load();
    return this.state.projects.find((project) => project.projectId === projectId) ?? null;
  }

  async listThreads(projectId: string): Promise<ThreadRecord[]> {
    await this.load();
    return this.state.threads.filter((thread) => thread.projectId === projectId);
  }

  async getThread(projectId: string, threadId: string): Promise<ThreadRecord | null> {
    await this.load();
    return (
      this.state.threads.find(
        (thread) => thread.projectId === projectId && thread.threadId === threadId
      ) ?? null
    );
  }

  async getActiveThread(): Promise<ThreadRecord | null> {
    await this.load();
    const activeProject = this.state.projects.find(
      (project) => typeof project.activeThreadId === "string" && project.activeThreadId.length > 0
    );
    if (!activeProject?.activeThreadId) {
      return null;
    }
    return (
      this.state.threads.find(
        (thread) =>
          thread.projectId === activeProject.projectId && thread.threadId === activeProject.activeThreadId
      ) ?? null
    );
  }

  async findThreadByAgentId(agentId: string): Promise<ThreadRecord | null> {
    await this.load();
    for (const [key, mappedAgentId] of this.threadAgentIds.entries()) {
      if (mappedAgentId !== agentId) {
        continue;
      }
      const parsedKey = parseThreadKey(key);
      if (!parsedKey) {
        continue;
      }
      return await this.getThread(parsedKey.projectId, parsedKey.threadId);
    }
    return null;
  }

  async findThreadByTerminalId(terminalId: string): Promise<ThreadRecord | null> {
    await this.load();
    const row = await this.database().get<ThreadRow>(
      `
        SELECT
          project_id,
          thread_id,
          title,
          status,
          unread_count,
          worktree_path,
          terminal_id,
          launch_config,
          created_at,
          updated_at,
          last_active_at,
          last_output_at,
          last_status_at
        FROM threads
        WHERE terminal_id = ?
        LIMIT 1
      `,
      terminalId
    );
    if (!row) {
      return null;
    }
    return this.toThreadRecord(row);
  }

  async setProjects(projects: Array<Omit<ProjectRecord, "createdAt" | "updatedAt">>): Promise<void> {
    await this.load();
    const db = this.database();
    const nowIso = new Date().toISOString();
    const existingRows = await db.all<ProjectRow[]>(
      `
        SELECT
          project_id,
          display_name,
          repo_root,
          default_base_branch,
          active_thread_id,
          created_at,
          updated_at
        FROM projects
      `
    );
    const existingById = new Map(existingRows.map((row) => [row.project_id, row]));

    for (const project of projects) {
      const existing = existingById.get(project.projectId);
      const nextActiveThreadId =
        project.activeThreadId === undefined
          ? (existing?.active_thread_id ?? null)
          : (project.activeThreadId ?? null);

      await db.run(
        `
          INSERT OR REPLACE INTO projects (
            project_id,
            display_name,
            repo_root,
            default_base_branch,
            active_thread_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        project.projectId,
        project.displayName,
        path.resolve(project.repoRoot),
        project.defaultBaseBranch ?? null,
        nextActiveThreadId,
        existing?.created_at ?? nowIso,
        nowIso
      );
    }

    await this.refreshStateFromDb();
  }

  async createThread(input: {
    projectId: string;
    threadId?: string;
    title: string;
    launchConfig: ThreadLaunchConfig;
    links?: ThreadLinks;
    status?: ThreadStatus;
  }): Promise<ThreadRecord> {
    await this.load();
    const db = this.database();
    const threadId = input.threadId ?? randomUUID();
    const nowIso = new Date().toISOString();
    const worktreePath = input.links?.worktreePath?.trim();
    if (!worktreePath) {
      throw new Error("worktreePath is required");
    }

    const existingProject = await db.get<ProjectRow>(
      `
        SELECT
          project_id,
          display_name,
          repo_root,
          default_base_branch,
          active_thread_id,
          created_at,
          updated_at
        FROM projects
        WHERE project_id = ?
      `,
      input.projectId
    );

    if (!existingProject) {
      await db.run(
        `
          INSERT OR REPLACE INTO projects (
            project_id,
            display_name,
            repo_root,
            default_base_branch,
            active_thread_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        input.projectId,
        input.projectId,
        process.cwd(),
        null,
        threadId,
        nowIso,
        nowIso
      );
    }

    await db.run(
      `
        INSERT OR REPLACE INTO threads (
          project_id,
          thread_id,
          title,
          status,
          unread_count,
          worktree_path,
          terminal_id,
          launch_config,
          created_at,
          updated_at,
          last_active_at,
          last_output_at,
          last_status_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.projectId,
      threadId,
      input.title,
      "idle",
      0,
      worktreePath,
      input.links?.terminalId ?? null,
      JSON.stringify(input.launchConfig),
      nowIso,
      nowIso,
      null,
      null,
      nowIso
    );

    await db.run(`UPDATE projects SET active_thread_id = NULL WHERE active_thread_id IS NOT NULL`);
    await db.run(
      `
        UPDATE projects
        SET active_thread_id = ?, updated_at = ?
        WHERE project_id = ?
      `,
      threadId,
      nowIso,
      input.projectId
    );

    const key = threadKey(input.projectId, threadId);
    if (input.links?.agentId) {
      this.threadAgentIds.set(key, input.links.agentId);
    } else {
      this.threadAgentIds.delete(key);
    }
    if (input.links?.sessionKey) {
      this.threadSessionKeys.set(key, input.links.sessionKey);
    } else {
      this.threadSessionKeys.delete(key);
    }

    await this.refreshStateFromDb();
    const created = this.state.threads.find(
      (thread) => thread.projectId === input.projectId && thread.threadId === threadId
    );
    if (!created) {
      throw new Error(`Thread not found after create: ${input.projectId}/${threadId}`);
    }
    ThreadRecordSchema.parse(created);
    return created;
  }

  async deleteThread(projectId: string, threadId: string): Promise<void> {
    await this.load();
    const db = this.database();
    const nowIso = new Date().toISOString();

    const existingThread = await this.getThread(projectId, threadId);
    if (!existingThread) {
      return;
    }

    await db.run(
      `
        DELETE FROM threads
        WHERE project_id = ? AND thread_id = ?
      `,
      projectId,
      threadId
    );

    this.threadAgentIds.delete(threadKey(projectId, threadId));
    this.threadSessionKeys.delete(threadKey(projectId, threadId));

    const activeProject = await db.get<ProjectRow>(
      `
        SELECT
          project_id,
          display_name,
          repo_root,
          default_base_branch,
          active_thread_id,
          created_at,
          updated_at
        FROM projects
        WHERE active_thread_id = ? AND project_id = ?
      `,
      threadId,
      projectId
    );

    if (activeProject) {
      const nextProjectThread = await db.get<{ thread_id: string }>(
        `
          SELECT thread_id
          FROM threads
          WHERE project_id = ?
          ORDER BY updated_at DESC, thread_id DESC
          LIMIT 1
        `,
        projectId
      );
      await db.run(
        `
          UPDATE projects
          SET active_thread_id = ?, updated_at = ?
          WHERE project_id = ?
        `,
        nextProjectThread?.thread_id ?? null,
        nowIso,
        projectId
      );
    }

    await this.refreshStateFromDb();
  }

  async switchThread(projectId: string, threadId: string): Promise<void> {
    await this.load();
    const db = this.database();
    const nowIso = new Date().toISOString();

    const existing = await db.get<{ thread_id: string }>(
      `
        SELECT thread_id
        FROM threads
        WHERE project_id = ? AND thread_id = ?
      `,
      projectId,
      threadId
    );
    if (!existing) {
      throw new Error(`Thread not found: ${projectId}/${threadId}`);
    }

    await db.run(`UPDATE projects SET active_thread_id = NULL WHERE active_thread_id IS NOT NULL`);
    await db.run(
      `
        UPDATE projects
        SET active_thread_id = ?, updated_at = ?
        WHERE project_id = ?
      `,
      threadId,
      nowIso,
      projectId
    );
    await db.run(
      `
        UPDATE threads
        SET unread_count = 0, last_active_at = ?, updated_at = ?
        WHERE project_id = ? AND thread_id = ?
      `,
      nowIso,
      nowIso,
      projectId,
      threadId
    );

    await this.refreshStateFromDb();
  }

  async updateThreadStatus(input: {
    projectId: string;
    threadId: string;
    status: ThreadStatus;
    outputAt?: string | null;
    incrementUnread?: boolean;
  }): Promise<void> {
    await this.load();
    const db = this.database();
    const nowIso = new Date().toISOString();

    const thread = await this.getThread(input.projectId, input.threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${input.projectId}/${input.threadId}`);
    }

    const activeThread = await this.getActiveThread();
    const isActive =
      activeThread?.projectId === input.projectId && activeThread.threadId === input.threadId;
    const nextUnreadCount =
      input.incrementUnread === true && !isActive ? thread.unreadCount + 1 : thread.unreadCount;
    const nextLastOutputAt = input.outputAt ?? thread.lastOutputAt ?? null;

    await db.run(
      `
        UPDATE threads
        SET
          status = ?,
          unread_count = ?,
          updated_at = ?,
          last_status_at = ?,
          last_output_at = ?
        WHERE project_id = ? AND thread_id = ?
      `,
      input.status,
      nextUnreadCount,
      nowIso,
      nowIso,
      nextLastOutputAt,
      input.projectId,
      input.threadId
    );

    await this.refreshStateFromDb();
  }

  async updateThread(input: {
    projectId: string;
    threadId: string;
    status?: ThreadStatus;
    links?: Partial<ThreadLinks>;
  }): Promise<ThreadRecord> {
    await this.load();
    const db = this.database();
    const nowIso = new Date().toISOString();

    const current = await this.getThread(input.projectId, input.threadId);
    if (!current) {
      throw new Error(`Thread not found: ${input.projectId}/${input.threadId}`);
    }

    const nextStatus = input.status ?? current.status;
    const nextTerminalId =
      input.links && Object.prototype.hasOwnProperty.call(input.links, "terminalId")
        ? (input.links.terminalId ?? null)
        : (current.links.terminalId ?? null);
    const nextWorktreePath =
      input.links && Object.prototype.hasOwnProperty.call(input.links, "worktreePath")
        ? input.links.worktreePath
        : current.links.worktreePath;

    if (!nextWorktreePath || nextWorktreePath.trim().length === 0) {
      throw new Error("worktreePath is required");
    }

    const key = threadKey(input.projectId, input.threadId);
    if (input.links && Object.prototype.hasOwnProperty.call(input.links, "agentId")) {
      if (input.links.agentId) {
        this.threadAgentIds.set(key, input.links.agentId);
      } else {
        this.threadAgentIds.delete(key);
      }
    }
    if (input.links && Object.prototype.hasOwnProperty.call(input.links, "sessionKey")) {
      if (input.links.sessionKey) {
        this.threadSessionKeys.set(key, input.links.sessionKey);
      } else {
        this.threadSessionKeys.delete(key);
      }
    }

    await db.run(
      `
        UPDATE threads
        SET
          status = ?,
          terminal_id = ?,
          worktree_path = ?,
          updated_at = ?,
          last_status_at = ?
        WHERE project_id = ? AND thread_id = ?
      `,
      nextStatus,
      nextTerminalId,
      nextWorktreePath,
      nowIso,
      input.status ? nowIso : (current.lastStatusAt ?? null),
      input.projectId,
      input.threadId
    );

    await this.refreshStateFromDb();
    const updated = this.state.threads.find(
      (thread) => thread.projectId === input.projectId && thread.threadId === input.threadId
    );
    if (!updated) {
      throw new Error(`Thread not found after update: ${input.projectId}/${input.threadId}`);
    }
    return updated;
  }

  async flush(): Promise<void> {
    await this.load();
  }

  private database(): DbHandle {
    if (this.db) {
      return this.db;
    }
    this.db = getDb();
    return this.db;
  }

  private async refreshStateFromDb(): Promise<void> {
    const db = this.database();
    const [projectRows, threadRows] = await Promise.all([
      db.all<ProjectRow[]>(
        `
          SELECT
            project_id,
            display_name,
            repo_root,
            default_base_branch,
            active_thread_id,
            created_at,
            updated_at
          FROM projects
        `
      ),
      db.all<ThreadRow[]>(
        `
          SELECT
            project_id,
            thread_id,
            title,
            status,
            unread_count,
            worktree_path,
            terminal_id,
            launch_config,
            created_at,
            updated_at,
            last_active_at,
            last_output_at,
            last_status_at
          FROM threads
        `
      ),
    ]);

    const projects = projectRows.map((row) =>
      ProjectRecordSchema.parse({
        projectId: row.project_id,
        displayName: row.display_name,
        repoRoot: row.repo_root,
        defaultBaseBranch: row.default_base_branch,
        activeThreadId: row.active_thread_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    );
    const threads = threadRows.map((row) => this.toThreadRecord(row));

    const activeProject = projects.find(
      (project) => typeof project.activeThreadId === "string" && project.activeThreadId.length > 0
    );

    const updatedAt =
      [...projects.map((project) => project.updatedAt), ...threads.map((thread) => thread.updatedAt)]
        .sort()
        .at(-1) ?? new Date().toISOString();

    this.state = normalizeState({
      version: 1,
      projects,
      threads,
      active: {
        projectId: activeProject?.projectId ?? null,
        threadId: activeProject?.activeThreadId ?? null,
      },
      updatedAt,
    });
  }

  private toThreadRecord(row: ThreadRow): ThreadRecord {
    const key = threadKey(row.project_id, row.thread_id);
    const launchConfig = this.parseLaunchConfig(row.launch_config);

    return ThreadRecordSchema.parse({
      projectId: row.project_id,
      threadId: row.thread_id,
      title: row.title,
      status: row.status,
      unreadCount: row.unread_count,
      launchConfig,
      links: {
        worktreePath: row.worktree_path,
        terminalId: row.terminal_id ?? null,
        agentId: this.threadAgentIds.get(key) ?? null,
        sessionKey: this.threadSessionKeys.get(key) ?? null,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActiveAt: row.last_active_at,
      lastOutputAt: row.last_output_at,
      lastStatusAt: row.last_status_at,
    });
  }

  private parseLaunchConfig(raw: string): ThreadLaunchConfig {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return ThreadLaunchConfigSchema.parse(parsed);
    } catch {
      return DEFAULT_LAUNCH_CONFIG;
    }
  }
}
