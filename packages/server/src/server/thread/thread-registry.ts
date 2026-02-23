import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { AgentProviderSchema } from "../agent/provider-manifest.js";
import { ProviderCommandSchema } from "../agent/provider-launch-config.js";

const THREAD_REGISTRY_FILENAME = "thread-registry.json";
const THREAD_REGISTRY_VERSION = 1;
const LEGACY_THREAD_ID = "active";
const LEGACY_THREAD_SCOPE = "phase2-active-thread-placeholder";
const COMPAT_PROJECT_ID = "project-default";
const COMPAT_THREAD_ID = "thread-default";

const ThreadStatusSchema = z.enum(["running", "idle", "error", "closed", "unknown"]);

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

const ActiveThreadPointerSchema = z
  .object({
    projectId: z.string().trim().min(1).nullable(),
    threadId: z.string().trim().min(1).nullable(),
  })
  .strict();

const LegacyCompatibilitySchema = z
  .object({
    placeholderThreadId: z.literal(LEGACY_THREAD_ID),
    placeholderThreadScope: z.literal(LEGACY_THREAD_SCOPE),
    seededProjectId: z.string().trim().min(1),
    seededThreadId: z.string().trim().min(1),
    seededAt: z.string(),
  })
  .strict();

const ThreadRegistryStateSchema = z
  .object({
    version: z.literal(THREAD_REGISTRY_VERSION),
    projects: z.array(ProjectRecordSchema),
    threads: z.array(ThreadRecordSchema),
    active: ActiveThreadPointerSchema,
    compatibility: LegacyCompatibilitySchema.optional(),
    updatedAt: z.string(),
  })
  .strict();

const LegacyPlaceholderStateSchema = z
  .object({
    threadId: z.literal(LEGACY_THREAD_ID).optional(),
    threadScope: z.literal(LEGACY_THREAD_SCOPE).optional(),
    sessionKey: z.string().nullable().optional(),
    cwd: z.string().nullable().optional(),
    terminalId: z.string().optional(),
    terminal: z
      .object({
        id: z.string(),
        cwd: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;
export type ThreadLaunchConfig = z.infer<typeof ThreadLaunchConfigSchema>;
export type ThreadLinks = z.infer<typeof ThreadLinksSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type ThreadRecord = z.infer<typeof ThreadRecordSchema>;
export type ThreadRegistryState = z.infer<typeof ThreadRegistryStateSchema>;

type ThreadRegistryLogger = {
  child(bindings: Record<string, unknown>): ThreadRegistryLogger;
  info(...args: any[]): void;
  warn(...args: any[]): void;
};

const DEFAULT_LAUNCH_CONFIG: ThreadLaunchConfig = {
  provider: "opencode",
};

function getDefaultRegistryState(nowIso: string): ThreadRegistryState {
  return {
    version: THREAD_REGISTRY_VERSION,
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

function toLegacyCompatibilitySeed(raw: z.infer<typeof LegacyPlaceholderStateSchema>): ThreadRegistryState {
  const nowIso = new Date().toISOString();
  const seedThreadId = COMPAT_THREAD_ID;
  const seedProjectId = COMPAT_PROJECT_ID;
  const fallbackRepoRoot = raw.cwd ?? raw.terminal?.cwd ?? process.cwd();
  const terminalId = raw.terminal?.id ?? raw.terminalId ?? null;
  return normalizeState({
    version: THREAD_REGISTRY_VERSION,
    projects: [
      {
        projectId: seedProjectId,
        displayName: "Default Project",
        repoRoot: path.resolve(fallbackRepoRoot),
        activeThreadId: seedThreadId,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    threads: [
      {
        projectId: seedProjectId,
        threadId: seedThreadId,
        title: "Default Thread",
        status: "idle",
        unreadCount: 0,
        launchConfig: DEFAULT_LAUNCH_CONFIG,
        links: {
          terminalId,
          sessionKey: raw.sessionKey ?? null,
          worktreePath: raw.cwd ?? raw.terminal?.cwd ?? null,
          agentId: null,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        lastActiveAt: nowIso,
        lastOutputAt: null,
        lastStatusAt: nowIso,
      },
    ],
    active: {
      projectId: seedProjectId,
      threadId: seedThreadId,
    },
    compatibility: {
      placeholderThreadId: LEGACY_THREAD_ID,
      placeholderThreadScope: LEGACY_THREAD_SCOPE,
      seededProjectId: seedProjectId,
      seededThreadId: seedThreadId,
      seededAt: nowIso,
    },
    updatedAt: nowIso,
  });
}

function parseState(raw: unknown): ThreadRegistryState {
  const parsed = ThreadRegistryStateSchema.safeParse(raw);
  if (parsed.success) {
    return normalizeState(parsed.data);
  }

  const legacy = LegacyPlaceholderStateSchema.safeParse(raw);
  const hasLegacyIdentity =
    legacy.success &&
    (legacy.data.threadId === LEGACY_THREAD_ID || legacy.data.threadScope === LEGACY_THREAD_SCOPE);
  if (hasLegacyIdentity) {
    return toLegacyCompatibilitySeed(legacy.data);
  }

  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid thread registry state:\n${issues.join("\n")}`);
}

function createProjectRecord(input: {
  projectId: string;
  displayName: string;
  repoRoot: string;
  defaultBaseBranch?: string | null;
  activeThreadId?: string | null;
}): ProjectRecord {
  const nowIso = new Date().toISOString();
  return {
    projectId: input.projectId,
    displayName: input.displayName,
    repoRoot: path.resolve(input.repoRoot),
    ...(input.defaultBaseBranch ? { defaultBaseBranch: input.defaultBaseBranch } : {}),
    activeThreadId: input.activeThreadId ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function createThreadRecord(input: {
  projectId: string;
  threadId?: string;
  title: string;
  launchConfig: ThreadLaunchConfig;
  links?: ThreadLinks;
  status?: ThreadStatus;
}): ThreadRecord {
  const nowIso = new Date().toISOString();
  return {
    projectId: input.projectId,
    threadId: input.threadId ?? randomUUID(),
    title: input.title,
    status: input.status ?? "idle",
    unreadCount: 0,
    launchConfig: input.launchConfig,
    links: input.links ?? {},
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: null,
    lastOutputAt: null,
    lastStatusAt: nowIso,
  };
}

export class ThreadRegistry {
  private readonly filePath: string;
  private readonly logger?: ThreadRegistryLogger;
  private state: ThreadRegistryState;
  private loaded = false;

  constructor(paseoHome: string, logger?: ThreadRegistryLogger) {
    this.filePath = path.join(paseoHome, THREAD_REGISTRY_FILENAME);
    this.logger = logger?.child({ module: "thread-registry" }) ?? undefined;
    this.state = getDefaultRegistryState(new Date().toISOString());
  }

  async load(): Promise<ThreadRegistryState> {
    if (this.loaded) {
      return this.getSnapshot();
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      this.state = parseState(parsed);
      this.loaded = true;
      this.logger?.info({ filePath: this.filePath }, "Loaded thread registry");
      await this.flush();
      return this.getSnapshot();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }

    this.state = getDefaultRegistryState(new Date().toISOString());
    this.loaded = true;
    await this.flush();
    this.logger?.info({ filePath: this.filePath }, "Initialized thread registry");
    return this.getSnapshot();
  }

  getSnapshot(): ThreadRegistryState {
    return normalizeState(JSON.parse(JSON.stringify(this.state)) as ThreadRegistryState);
  }

  async setProjects(projects: Array<Omit<ProjectRecord, "createdAt" | "updatedAt">>): Promise<void> {
    await this.load();
    const nowIso = new Date().toISOString();
    const currentById = new Map(this.state.projects.map((project) => [project.projectId, project]));

    this.state.projects = projects.map((project) => {
      const existing = currentById.get(project.projectId);
      return {
        ...project,
        repoRoot: path.resolve(project.repoRoot),
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
    });
    this.state.updatedAt = nowIso;
    this.state = normalizeState(this.state);
    await this.flush();
  }

  async createThread(input: {
    projectId: string;
    threadId?: string;
    title: string;
    launchConfig: ThreadLaunchConfig;
    links?: ThreadLinks;
  }): Promise<ThreadRecord> {
    await this.load();
    const thread = createThreadRecord(input);
    ThreadRecordSchema.parse(thread);

    const hasProject = this.state.projects.some((project) => project.projectId === input.projectId);
    if (!hasProject) {
      this.state.projects.push(
        createProjectRecord({
          projectId: input.projectId,
          displayName: input.projectId,
          repoRoot: process.cwd(),
          activeThreadId: thread.threadId,
        })
      );
    }

    this.state.threads = this.state.threads.filter(
      (existing) => !(existing.projectId === thread.projectId && existing.threadId === thread.threadId)
    );
    this.state.threads.push(thread);
    this.state.active = {
      projectId: thread.projectId,
      threadId: thread.threadId,
    };
    this.state.projects = this.state.projects.map((project) =>
      project.projectId === thread.projectId
        ? {
            ...project,
            activeThreadId: thread.threadId,
            updatedAt: new Date().toISOString(),
          }
        : project
    );
    this.state.updatedAt = new Date().toISOString();
    this.state = normalizeState(this.state);
    await this.flush();
    return thread;
  }

  async deleteThread(projectId: string, threadId: string): Promise<void> {
    await this.load();
    const before = this.state.threads.length;
    this.state.threads = this.state.threads.filter(
      (thread) => !(thread.projectId === projectId && thread.threadId === threadId)
    );
    if (this.state.threads.length === before) {
      return;
    }

    const nextProjectThread = this.state.threads.find((thread) => thread.projectId === projectId) ?? null;
    this.state.projects = this.state.projects.map((project) => {
      if (project.projectId !== projectId) {
        return project;
      }
      return {
        ...project,
        activeThreadId: nextProjectThread?.threadId ?? null,
        updatedAt: new Date().toISOString(),
      };
    });

    if (this.state.active.projectId === projectId && this.state.active.threadId === threadId) {
      this.state.active = {
        projectId: nextProjectThread?.projectId ?? null,
        threadId: nextProjectThread?.threadId ?? null,
      };
    }

    this.state.updatedAt = new Date().toISOString();
    this.state = normalizeState(this.state);
    await this.flush();
  }

  async switchThread(projectId: string, threadId: string): Promise<void> {
    await this.load();
    const thread = this.state.threads.find(
      (candidate) => candidate.projectId === projectId && candidate.threadId === threadId
    );
    if (!thread) {
      throw new Error(`Thread not found: ${projectId}/${threadId}`);
    }

    const nowIso = new Date().toISOString();
    this.state.active = {
      projectId,
      threadId,
    };
    this.state.projects = this.state.projects.map((project) =>
      project.projectId === projectId
        ? {
            ...project,
            activeThreadId: threadId,
            updatedAt: nowIso,
          }
        : project
    );
    this.state.threads = this.state.threads.map((existing) =>
      existing.projectId === projectId && existing.threadId === threadId
        ? {
            ...existing,
            unreadCount: 0,
            lastActiveAt: nowIso,
            updatedAt: nowIso,
          }
        : existing
    );
    this.state.updatedAt = nowIso;
    this.state = normalizeState(this.state);
    await this.flush();
  }

  async updateThreadStatus(input: {
    projectId: string;
    threadId: string;
    status: ThreadStatus;
    outputAt?: string | null;
    incrementUnread?: boolean;
  }): Promise<void> {
    await this.load();
    const nowIso = new Date().toISOString();
    const isActive =
      this.state.active.projectId === input.projectId && this.state.active.threadId === input.threadId;

    this.state.threads = this.state.threads.map((thread) => {
      if (thread.projectId !== input.projectId || thread.threadId !== input.threadId) {
        return thread;
      }
      return {
        ...thread,
        status: input.status,
        unreadCount:
          input.incrementUnread === true && !isActive ? thread.unreadCount + 1 : thread.unreadCount,
        lastStatusAt: nowIso,
        lastOutputAt: input.outputAt ?? thread.lastOutputAt ?? null,
        updatedAt: nowIso,
      };
    });

    this.state.updatedAt = nowIso;
    this.state = normalizeState(this.state);
    await this.flush();
  }

  async flush(): Promise<void> {
    const validated = ThreadRegistryStateSchema.parse(normalizeState(this.state));
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, JSON.stringify(validated, null, 2) + "\n", "utf8");
    await rename(tempPath, this.filePath);
  }
}
