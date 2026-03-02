import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetDbForTesting, getDb, initDb, type DbHandle } from "./db.js";
import { ThreadRegistry } from "./thread-registry.js";

const PROJECT = {
  projectId: "proj-1",
  displayName: "Test Project",
  repoRoot: "/tmp/repo",
  defaultBaseBranch: "main",
};

function makeThreadInput(
  overrides: Partial<{
    projectId: string;
    threadId: string;
    title: string;
    launchConfig: { provider: "opencode" | "codex" | "claude-code"; modeId?: string | null };
    links: {
      worktreePath?: string | null;
      terminalId?: string | null;
      agentId?: string | null;
      sessionKey?: string | null;
    };
  }> = {}
) {
  return {
    projectId: "proj-1",
    threadId: "thread-1",
    title: "Test Thread",
    launchConfig: { provider: "opencode" as const },
    links: { worktreePath: "/tmp/repo/worktrees/thread-1" },
    ...overrides,
  };
}

function makeMemoryRegistry(): ThreadRegistry {
  const registry = new ThreadRegistry("/unused");
  (registry as unknown as { loaded: boolean; db: DbHandle }).loaded = true;
  (registry as unknown as { loaded: boolean; db: DbHandle }).db = getDb();
  return registry;
}

describe("ThreadRegistry (SQLite)", () => {
  let registry: ThreadRegistry;

  beforeEach(async () => {
    _resetDbForTesting();
    await initDb(":memory:");
    registry = makeMemoryRegistry();
    await registry.setProjects([PROJECT]);
  });

  afterEach(() => {
    _resetDbForTesting();
  });

  it("createThread writes idle status directly", async () => {
    await registry.createThread(makeThreadInput());
    const thread = await registry.getThread("proj-1", "thread-1");
    expect(thread?.status).toBe("idle");
    expect(thread?.links.worktreePath).toBe("/tmp/repo/worktrees/thread-1");
  });

  it("createThread throws if worktreePath missing", async () => {
    await expect(
      registry.createThread(makeThreadInput({ links: {} }))
    ).rejects.toThrow("worktreePath is required");
  });

  it("deleteThread removes the thread", async () => {
    await registry.createThread(makeThreadInput());
    await registry.deleteThread("proj-1", "thread-1");
    const thread = await registry.getThread("proj-1", "thread-1");
    expect(thread).toBeNull();
  });

  it("switchThread sets active thread", async () => {
    await registry.createThread(makeThreadInput({ threadId: "thread-1" }));
    await registry.createThread(makeThreadInput({ threadId: "thread-2" }));

    await registry.switchThread("proj-1", "thread-1");
    const active = await registry.getActiveThread();
    expect(active?.threadId).toBe("thread-1");
  });

  it("getActiveThread returns null initially", async () => {
    const emptyRegistry = makeMemoryRegistry();
    await emptyRegistry.setProjects([PROJECT]);
    const active = await emptyRegistry.getActiveThread();
    expect(active).toBeNull();
  });

  it("findThreadByAgentId uses in-memory map", async () => {
    await registry.createThread(makeThreadInput());
    await registry.updateThread({
      projectId: "proj-1",
      threadId: "thread-1",
      links: { agentId: "agent-abc" },
    });
    const thread = await registry.findThreadByAgentId("agent-abc");
    expect(thread?.threadId).toBe("thread-1");

    const row = await getDb().get<{ terminal_id: string | null }>(
      "SELECT terminal_id FROM threads WHERE project_id = ? AND thread_id = ?",
      "proj-1",
      "thread-1"
    );
    expect(row).toEqual({ terminal_id: null });
  });

  it("findThreadByTerminalId uses DB", async () => {
    await registry.createThread(makeThreadInput());
    await registry.updateThread({
      projectId: "proj-1",
      threadId: "thread-1",
      links: { terminalId: "term-xyz" },
    });
    const thread = await registry.findThreadByTerminalId("term-xyz");
    expect(thread?.threadId).toBe("thread-1");
  });

  it("sessionKey is in-memory only (not persisted to DB)", async () => {
    await registry.createThread(makeThreadInput());
    await registry.updateThread({
      projectId: "proj-1",
      threadId: "thread-1",
      links: { sessionKey: "session-abc" },
    });

    const thread = await registry.getThread("proj-1", "thread-1");
    expect(thread?.links.sessionKey).toBe("session-abc");

    const schemaColumns = await getDb().all<{ name: string }[]>("PRAGMA table_info(threads)");
    expect(schemaColumns.some((column) => column.name === "session_key")).toBe(false);

    const row = await getDb().get<Record<string, unknown>>(
      "SELECT * FROM threads WHERE project_id = ? AND thread_id = ?",
      "proj-1",
      "thread-1"
    );
    expect(row?.session_key).toBeUndefined();
  });

  it("deleteThread clears agentId map", async () => {
    await registry.createThread(makeThreadInput());
    await registry.updateThread({
      projectId: "proj-1",
      threadId: "thread-1",
      links: { agentId: "agent-abc" },
    });
    await registry.deleteThread("proj-1", "thread-1");
    const found = await registry.findThreadByAgentId("agent-abc");
    expect(found).toBeNull();
  });

  it("listThreads returns all threads for project", async () => {
    await registry.createThread(
      makeThreadInput({ threadId: "t1", links: { worktreePath: "/tmp/repo/worktrees/t1" } })
    );
    await registry.createThread(
      makeThreadInput({ threadId: "t2", links: { worktreePath: "/tmp/repo/worktrees/t2" } })
    );
    const threads = await registry.listThreads("proj-1");
    expect(threads).toHaveLength(2);
  });
});
