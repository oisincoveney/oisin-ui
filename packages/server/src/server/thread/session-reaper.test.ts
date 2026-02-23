import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ThreadRegistry } from "./thread-registry.js";
import { ThreadSessionReaper } from "./session-reaper.js";

describe("ThreadSessionReaper", () => {
  let paseoHomeRoot: string;
  let paseoHome: string;
  let registry: ThreadRegistry;

  beforeEach(async () => {
    paseoHomeRoot = await mkdtemp(path.join(tmpdir(), "thread-reaper-"));
    paseoHome = path.join(paseoHomeRoot, ".paseo");
    registry = new ThreadRegistry(paseoHome);
    await registry.load();
    await registry.setProjects([
      {
        projectId: "proj-1",
        displayName: "Project One",
        repoRoot: "/tmp/proj-1",
        defaultBaseBranch: "main",
        activeThreadId: null,
      },
    ]);
    await registry.createThread({
      projectId: "proj-1",
      threadId: "thread-1",
      title: "Thread One",
      launchConfig: { provider: "opencode" },
      links: {
        sessionKey: "oisin-proj-1-thread-1-abc123",
        worktreePath: path.join(paseoHome, "worktrees", "proj1", "thread-1"),
        agentId: "agent-1",
      },
      status: "running",
    });
  });

  afterEach(async () => {
    await rm(paseoHomeRoot, { recursive: true, force: true });
  });

  it("cleans orphaned Paseo agents, tmux sessions, and worktrees while preserving tracked resources", async () => {
    const closeAgent = vi.fn(async () => {});
    const killTmuxSession = vi.fn();
    const deleteWorktree = vi.fn(async () => {});

    const reaper = new ThreadSessionReaper(
      {
        threadRegistry: registry,
        paseoHome,
        agentManager: {
          listAgents: () =>
            [
              {
                id: "agent-1",
                cwd: path.join(paseoHome, "worktrees", "proj1", "thread-1"),
                labels: { projectId: "proj-1", threadId: "thread-1" },
                lifecycle: "running",
              },
              {
                id: "agent-orphan",
                cwd: path.join(paseoHome, "worktrees", "proj1", "thread-orphan"),
                labels: { projectId: "proj-1", threadId: "thread-orphan" },
                lifecycle: "running",
              },
            ] as any,
          closeAgent,
        },
      },
      {
        listTmuxSessions: vi.fn(async () => [
          {
            sessionKey: "oisin-proj-1-thread-1-abc123",
            cwd: path.join(paseoHome, "worktrees", "proj1", "thread-1"),
          },
          {
            sessionKey: "oisin-proj-1-thread-orphan-def456",
            cwd: path.join(paseoHome, "worktrees", "proj1", "thread-orphan"),
          },
        ]),
        killTmuxSession,
        listProjectWorktrees: vi.fn(async () => [
          path.join(paseoHome, "worktrees", "proj1", "thread-1"),
          path.join(paseoHome, "worktrees", "proj1", "thread-orphan"),
        ]),
        deleteWorktree,
      }
    );

    await reaper.runOnce();

    expect(closeAgent).toHaveBeenCalledWith("agent-orphan");
    expect(closeAgent).not.toHaveBeenCalledWith("agent-1");
    expect(killTmuxSession).toHaveBeenCalledWith("oisin-proj-1-thread-orphan-def456", undefined);
    expect(deleteWorktree).toHaveBeenCalledWith(
      "/tmp/proj-1",
      path.join(paseoHome, "worktrees", "proj1", "thread-orphan"),
      path.join(paseoHome)
    );
    expect(deleteWorktree).not.toHaveBeenCalledWith(
      "/tmp/proj-1",
      path.join(paseoHome, "worktrees", "proj1", "thread-1"),
      path.join(paseoHome)
    );
  });

  it("does not delete sessions or worktrees outside Paseo ownership", async () => {
    const closeAgent = vi.fn(async () => {});
    const killTmuxSession = vi.fn();
    const deleteWorktree = vi.fn(async () => {});

    const reaper = new ThreadSessionReaper(
      {
        threadRegistry: registry,
        paseoHome,
        agentManager: {
          listAgents: () =>
            [
              {
                id: "agent-external",
                cwd: "/Users/oisin/dev/other-project",
                labels: {},
                lifecycle: "running",
              },
            ] as any,
          closeAgent,
        },
      },
      {
        listTmuxSessions: vi.fn(async () => [
          {
            sessionKey: "oisin-external-session",
            cwd: "/Users/oisin/dev/other-project",
          },
        ]),
        killTmuxSession,
        listProjectWorktrees: vi.fn(async () => ["/Users/oisin/dev/other-project/worktree-a"]),
        deleteWorktree,
      }
    );

    await reaper.runOnce();

    expect(closeAgent).not.toHaveBeenCalled();
    expect(killTmuxSession).not.toHaveBeenCalled();
    expect(deleteWorktree).not.toHaveBeenCalled();
  });
});
