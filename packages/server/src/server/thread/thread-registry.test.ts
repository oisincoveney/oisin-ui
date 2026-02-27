import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThreadRegistry } from "./thread-registry.js";

describe("ThreadRegistry", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "thread-registry-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  it("initializes empty deterministic registry state", async () => {
    const registry = new ThreadRegistry(paseoHome);
    const state = await registry.load();

    expect(state.version).toBe(1);
    expect(state.projects).toEqual([]);
    expect(state.threads).toEqual([]);
    expect(state.active).toEqual({ projectId: null, threadId: null });
  });

  it("persists projects and threads across restart", async () => {
    const registry = new ThreadRegistry(paseoHome);
    await registry.load();

    await registry.setProjects([
      {
        projectId: "proj-1",
        displayName: "Repo One",
        repoRoot: path.join(paseoHome, "repo-one"),
        defaultBaseBranch: "main",
        activeThreadId: null,
      },
    ]);

    const thread = await registry.createThread({
      projectId: "proj-1",
      threadId: "thread-1",
      title: "Initial thread",
      launchConfig: {
        provider: "opencode",
      },
      links: {
        terminalId: "terminal-1",
        sessionKey: "session-key-1",
      },
    });
    await registry.switchThread("proj-1", thread.threadId);

    const reloaded = new ThreadRegistry(paseoHome);
    const nextState = await reloaded.load();

    expect(nextState.projects).toHaveLength(1);
    expect(nextState.threads).toHaveLength(1);
    expect(nextState.active).toEqual({ projectId: "proj-1", threadId: "thread-1" });
    expect(nextState.threads[0]?.links.terminalId).toBe("terminal-1");
  });

  it("writes atomically using temp file + rename", async () => {
    const registry = new ThreadRegistry(paseoHome);
    await registry.load();
    await registry.setProjects([
      {
        projectId: "proj-atomic",
        displayName: "Atomic Repo",
        repoRoot: path.join(paseoHome, "repo-atomic"),
        activeThreadId: null,
      },
    ]);

    const entries = await readdir(paseoHome);
    expect(entries.some((entry) => entry.includes(".tmp-"))).toBe(false);
    expect(entries).toContain("thread-registry.json");
  });

  it("preserves existing project activeThreadId when syncing configured projects", async () => {
    const registry = new ThreadRegistry(paseoHome);
    await registry.load();
    await registry.setProjects([
      {
        projectId: "proj-sync",
        displayName: "Sync Repo",
        repoRoot: path.join(paseoHome, "repo-sync"),
        defaultBaseBranch: "main",
        activeThreadId: null,
      },
    ]);

    const thread = await registry.createThread({
      projectId: "proj-sync",
      threadId: "thread-active",
      title: "Active Thread",
      launchConfig: { provider: "opencode" },
    });
    await registry.switchThread("proj-sync", thread.threadId);

    await registry.setProjects([
      {
        projectId: "proj-sync",
        displayName: "Sync Repo",
        repoRoot: path.join(paseoHome, "repo-sync"),
        defaultBaseBranch: "main",
      },
    ]);

    const project = await registry.getProject("proj-sync");
    expect(project?.activeThreadId).toBe("thread-active");
  });

  it("migrates legacy placeholder-only state to compatibility seed record", async () => {
    const legacyPath = path.join(paseoHome, "thread-registry.json");
    await writeFile(
      legacyPath,
      JSON.stringify(
        {
          threadId: "active",
          threadScope: "phase2-active-thread-placeholder",
          terminal: {
            id: "terminal-legacy",
            cwd: path.join(paseoHome, "legacy-repo"),
          },
          sessionKey: "legacy-session",
        },
        null,
        2
      ),
      "utf8"
    );

    const registry = new ThreadRegistry(paseoHome);
    const state = await registry.load();

    expect(state.projects).toHaveLength(1);
    expect(state.threads).toHaveLength(1);
    expect(state.compatibility?.placeholderThreadId).toBe("active");
    expect(state.compatibility?.placeholderThreadScope).toBe("phase2-active-thread-placeholder");
    expect(state.active.projectId).toBe(state.compatibility?.seededProjectId ?? null);
    expect(state.active.threadId).toBe(state.compatibility?.seededThreadId ?? null);
    expect(state.threads[0]?.links.terminalId).toBe("terminal-legacy");

    const persisted = JSON.parse(await readFile(legacyPath, "utf8")) as {
      version: number;
      projects: unknown[];
      threads: unknown[];
    };
    expect(persisted.version).toBe(1);
    expect(persisted.projects.length).toBe(1);
    expect(persisted.threads.length).toBe(1);
  });

  describe("getActiveThread", () => {
    it("returns null when no threads exist", async () => {
      const registry = new ThreadRegistry(paseoHome);
      await registry.load();

      const active = await registry.getActiveThread();
      expect(active).toBeNull();
    });

    it("returns null when active pointer is cleared", async () => {
      const registry = new ThreadRegistry(paseoHome);
      await registry.load();

      const thread = await registry.createThread({
        projectId: "proj-clear",
        threadId: "thread-clear",
        title: "Thread to clear",
        launchConfig: { provider: "opencode" },
      });

      // Delete the thread — active pointer should clear
      await registry.deleteThread("proj-clear", thread.threadId);

      const active = await registry.getActiveThread();
      expect(active).toBeNull();
    });

    it("returns the active thread after createThread", async () => {
      const registry = new ThreadRegistry(paseoHome);
      await registry.load();

      const thread = await registry.createThread({
        projectId: "proj-active",
        threadId: "thread-active-1",
        title: "Active Thread",
        launchConfig: { provider: "opencode" },
      });

      const active = await registry.getActiveThread();
      expect(active).not.toBeNull();
      expect(active!.projectId).toBe("proj-active");
      expect(active!.threadId).toBe(thread.threadId);
      expect(active!.title).toBe("Active Thread");
    });

    it("returns the switched-to thread after switchThread", async () => {
      const registry = new ThreadRegistry(paseoHome);
      await registry.load();

      const threadA = await registry.createThread({
        projectId: "proj-switch",
        threadId: "thread-switch-a",
        title: "Thread A",
        launchConfig: { provider: "opencode" },
      });

      const threadB = await registry.createThread({
        projectId: "proj-switch",
        threadId: "thread-switch-b",
        title: "Thread B",
        launchConfig: { provider: "opencode" },
      });

      // After creating B, B is active. Switch back to A.
      await registry.switchThread("proj-switch", threadA.threadId);
      let active = await registry.getActiveThread();
      expect(active).not.toBeNull();
      expect(active!.threadId).toBe(threadA.threadId);

      // Switch to B
      await registry.switchThread("proj-switch", threadB.threadId);
      active = await registry.getActiveThread();
      expect(active).not.toBeNull();
      expect(active!.threadId).toBe(threadB.threadId);
    });
  });
});
