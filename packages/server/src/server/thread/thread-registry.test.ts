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
});
