import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ThreadRegistry } from "./thread-registry.js";
import { ThreadLifecycleDirtyWorktreeError, ThreadLifecycleService } from "./thread-lifecycle.js";

describe("ThreadLifecycleService", () => {
  let paseoHome: string;
  let registry: ThreadRegistry;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "thread-lifecycle-"));
    registry = new ThreadRegistry(paseoHome);
    await registry.load();
    await registry.setProjects([
      {
        projectId: "proj-1",
        displayName: "Project One",
        repoRoot: "/tmp/project-one",
        defaultBaseBranch: "main",
        activeThreadId: null,
      },
    ]);
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  it("creates thread immediately without requiring agent startup", async () => {
    const createWorktree = vi.fn(async () => ({
      branchName: "feature-thread",
      worktreePath: "/tmp/project-one/.paseo/worktrees/thread-a",
    }));
    const deleteWorktreeChecked = vi.fn(async () => {});
    const getWorktreePorcelainStatus = vi.fn(async () => []);

    const terminalManager = {
      ensureThreadTerminal: vi.fn(async () => ({
        terminal: { id: "term-1", name: "Terminal 1", cwd: "/tmp/project-one/.paseo/worktrees/thread-a" },
        sessionKey: "oisin-proj-1-thread-a-hash",
        cwd: "/tmp/project-one/.paseo/worktrees/thread-a",
      })),
      killTerminalsBySessionKey: vi.fn(),
    } as any;

    const agentManager = {
      createAgent: vi.fn(async () => ({ id: "agent-1" })),
      closeAgent: vi.fn(async () => {}),
    } as any;

    const lifecycle = new ThreadLifecycleService(
      {
        threadRegistry: registry,
        terminalManager,
        agentManager,
        paseoHome,
      },
      {
        createWorktree,
        deleteWorktreeChecked,
        getWorktreePorcelainStatus,
      }
    );

    const created = await lifecycle.createThread({
      projectId: "proj-1",
      title: "Thread A",
      threadId: "thread-a",
      launchConfig: { provider: "opencode" },
    });

    expect(created.thread.threadId).toBe("thread-a");
    expect(created.thread.status).toBe("idle");
    expect(created.thread.links.agentId).toBeNull();
    expect(terminalManager.killTerminalsBySessionKey).not.toHaveBeenCalled();
    expect(deleteWorktreeChecked).not.toHaveBeenCalled();
    expect(agentManager.createAgent).not.toHaveBeenCalled();

    const threads = await registry.listThreads("proj-1");
    expect(threads).toHaveLength(1);
  });

  it("marks thread running and stores agent id when provisioning succeeds", async () => {
    const createWorktree = vi.fn(async () => ({
      branchName: "feature-thread",
      worktreePath: "/tmp/project-one/.paseo/worktrees/thread-a",
    }));

    const terminalManager = {
      ensureThreadTerminal: vi.fn(async () => ({
        terminal: { id: "term-1", name: "Terminal 1", cwd: "/tmp/project-one/.paseo/worktrees/thread-a" },
        sessionKey: "oisin-proj-1-thread-a-hash",
        cwd: "/tmp/project-one/.paseo/worktrees/thread-a",
      })),
      killTerminalsBySessionKey: vi.fn(),
    } as any;

    const agentManager = {
      createAgent: vi.fn(async () => ({ id: "agent-1" })),
      closeAgent: vi.fn(async () => {}),
    } as any;

    const lifecycle = new ThreadLifecycleService(
      {
        threadRegistry: registry,
        terminalManager,
        agentManager,
        paseoHome,
      },
      {
        createWorktree,
        deleteWorktreeChecked: vi.fn(async () => {}),
        getWorktreePorcelainStatus: vi.fn(async () => []),
        runWorktreeSetupCommands: vi.fn(async () => []),
      }
    );

    await lifecycle.createThread({
      projectId: "proj-1",
      title: "Thread A",
      threadId: "thread-a",
      launchConfig: { provider: "opencode" },
    });

    const updated = await lifecycle.startThreadProvisioning({
      projectId: "proj-1",
      threadId: "thread-a",
    });

    expect(updated.status).toBe("running");
    expect(updated.links.agentId).toBe("agent-1");
    expect(agentManager.createAgent).toHaveBeenCalled();
  });

  it("requires force confirmation when deleting dirty worktrees", async () => {
    await registry.createThread({
      projectId: "proj-1",
      threadId: "thread-dirty",
      title: "Dirty Thread",
      launchConfig: { provider: "opencode" },
      links: {
        worktreePath: "/tmp/project-one/.paseo/worktrees/thread-dirty",
        sessionKey: "session-dirty",
        terminalId: "term-dirty",
        agentId: "agent-dirty",
      },
    });

    const terminalManager = {
      killTerminalsBySessionKey: vi.fn(),
    } as any;
    const agentManager = {
      closeAgent: vi.fn(async () => {}),
    } as any;

    const lifecycle = new ThreadLifecycleService(
      {
        threadRegistry: registry,
        terminalManager,
        agentManager,
        paseoHome,
      },
      {
        createWorktree: vi.fn(async () => ({ branchName: "n/a", worktreePath: "n/a" })),
        deleteWorktreeChecked: vi.fn(async () => {}),
        getWorktreePorcelainStatus: vi.fn(async () => ["M src/file.ts"]),
      }
    );

    await expect(
      lifecycle.deleteThread({
        projectId: "proj-1",
        threadId: "thread-dirty",
      })
    ).rejects.toBeInstanceOf(ThreadLifecycleDirtyWorktreeError);

    expect(agentManager.closeAgent).not.toHaveBeenCalled();
    expect(terminalManager.killTerminalsBySessionKey).not.toHaveBeenCalled();
  });

  it("deletes thread resources when forceDirtyDelete is true", async () => {
    await registry.createThread({
      projectId: "proj-1",
      threadId: "thread-delete",
      title: "Delete Thread",
      launchConfig: { provider: "opencode" },
      links: {
        worktreePath: "/tmp/project-one/.paseo/worktrees/thread-delete",
        sessionKey: "session-delete",
        terminalId: "term-delete",
        agentId: "agent-delete",
      },
    });

    const deleteWorktreeChecked = vi.fn(async () => {});
    const terminalManager = {
      killTerminalsBySessionKey: vi.fn(),
    } as any;
    const agentManager = {
      closeAgent: vi.fn(async () => {}),
    } as any;

    const lifecycle = new ThreadLifecycleService(
      {
        threadRegistry: registry,
        terminalManager,
        agentManager,
        paseoHome,
      },
      {
        createWorktree: vi.fn(async () => ({ branchName: "n/a", worktreePath: "n/a" })),
        deleteWorktreeChecked,
        getWorktreePorcelainStatus: vi.fn(async () => ["M src/file.ts"]),
      }
    );

    await lifecycle.deleteThread({
      projectId: "proj-1",
      threadId: "thread-delete",
      forceDirtyDelete: true,
    });

    expect(agentManager.closeAgent).toHaveBeenCalledWith("agent-delete");
    expect(terminalManager.killTerminalsBySessionKey).toHaveBeenCalledWith("session-delete");
    expect(deleteWorktreeChecked).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreePath: "/tmp/project-one/.paseo/worktrees/thread-delete",
        allowDirty: true,
      })
    );

    const threads = await registry.listThreads("proj-1");
    expect(threads.find((thread) => thread.threadId === "thread-delete") ?? null).toBeNull();
  });
});
