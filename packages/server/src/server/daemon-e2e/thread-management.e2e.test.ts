import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createDaemonTestContext,
  type DaemonTestContext,
  DaemonClient,
} from "../test-utils/index.js";

const decoder = new TextDecoder();
const shouldRun = !process.env.CI;

function createRepoRoot(prefix: string, options?: { withBunWorktreeSetup?: boolean }): string {
  const repoRoot = mkdtempSync(path.join(tmpdir(), prefix));
  execSync("git init -b main", { cwd: repoRoot, stdio: "pipe" });
  execSync("git config user.email 'thread-e2e@test.local'", { cwd: repoRoot, stdio: "pipe" });
  execSync("git config user.name 'Thread E2E'", { cwd: repoRoot, stdio: "pipe" });
  writeFileSync(path.join(repoRoot, "README.md"), "# thread test\n");
  execSync("git add README.md", { cwd: repoRoot, stdio: "pipe" });
  execSync("git commit -m 'initial'", { cwd: repoRoot, stdio: "pipe" });
  execSync("git checkout -b release-base", { cwd: repoRoot, stdio: "pipe" });
  writeFileSync(path.join(repoRoot, "release-only.txt"), "release-branch\n");
  execSync("git add release-only.txt", { cwd: repoRoot, stdio: "pipe" });
  execSync("git commit -m 'release branch seed'", { cwd: repoRoot, stdio: "pipe" });
  execSync("git checkout main", { cwd: repoRoot, stdio: "pipe" });

  if (options?.withBunWorktreeSetup) {
    const depDir = path.join(repoRoot, "dep");
    mkdirSync(depDir, { recursive: true });
    writeFileSync(path.join(depDir, "package.json"), `${JSON.stringify({ name: "dep", version: "1.0.0" }, null, 2)}\n`);
    writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "thread-e2e-bun",
          private: true,
          version: "1.0.0",
          dependencies: { dep: "file:./dep" },
        },
        null,
        2
      )}\n`
    );
    writeFileSync(path.join(repoRoot, ".gitignore"), "node_modules/\n");
    execSync("bun install --save-text-lockfile", { cwd: repoRoot, stdio: "pipe" });
    writeFileSync(
      path.join(repoRoot, "paseo.json"),
      `${JSON.stringify({ worktree: { setup: ["bun install --frozen-lockfile"] } }, null, 2)}\n`
    );
    const lockfileName = existsSync(path.join(repoRoot, "bun.lock")) ? "bun.lock" : "bun.lockb";
    execSync(`git add .gitignore dep/package.json package.json ${lockfileName} paseo.json`, {
      cwd: repoRoot,
      stdio: "pipe",
    });
    execSync("git commit -m 'seed bun worktree setup'", { cwd: repoRoot, stdio: "pipe" });
  }

  return repoRoot;
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 25
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

function tmuxSessionExists(sessionKey: string, socketPath: string): boolean {
  try {
    execFileSync("tmux", ["-S", socketPath, "has-session", "-t", sessionKey], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

(shouldRun ? describe : describe.skip)("daemon E2E thread management", () => {
  let ctx: DaemonTestContext;
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = createRepoRoot("daemon-thread-mgmt-");
    ctx = await createDaemonTestContext();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
    if (repoRoot) {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 60000);

  test(
    "covers project listing, create/switch/delete lifecycle, reconnect attach, and full cleanup",
    async () => {
      const projectId = "proj-thread-e2e";
      const projectAdded = await ctx.client.addProject({
        projectId,
        displayName: "Thread E2E Project",
        repoRoot,
        defaultBaseBranch: "main",
      });
      expect(projectAdded.accepted).toBe(true);
      expect(projectAdded.error).toBeNull();

      const projects = await ctx.client.listProjects();
      expect(projects.projects.some((project) => project.projectId === projectId)).toBe(true);

      const createA = await ctx.client.createThread({
        projectId,
        title: "Thread Alpha",
        baseBranch: "release-base",
        launchConfig: {
          provider: "opencode",
          commandOverride: {
            mode: "append",
            args: ["--model", "test-model"],
          },
        },
      });
      expect(createA.accepted).toBe(true);
      expect(createA.error).toBeNull();
      expect(createA.thread?.terminalId).toBeTruthy();
      expect(createA.thread?.agentId).toBeTruthy();
      const threadA = createA.thread!;

      const threadAWorktree = readThreadWorktreePath(
        path.join(ctx.daemon.paseoHome, "thread-registry.json"),
        projectId,
        threadA.threadId
      );
      expect(threadAWorktree).toBeTruthy();
      expect(existsSync(path.join(threadAWorktree!, "release-only.txt"))).toBe(true);

      const threadAConfig = readStoredAgentConfig(ctx.daemon.paseoHome, threadA.agentId!);
      expect(threadAConfig).toBeTruthy();
      expect(threadAConfig?.extra).toMatchObject({
        opencode: {
          commandOverride: {
            mode: "append",
            args: ["--model", "test-model"],
          },
        },
      });

      const createB = await ctx.client.createThread({
        projectId,
        title: "Thread Beta",
        launchConfig: { provider: "opencode" },
      });
      expect(createB.accepted).toBe(true);
      const threadB = createB.thread!;

      const listedAfterCreate = await ctx.client.listThreads(projectId);
      expect(listedAfterCreate.threads).toHaveLength(2);
      expect(listedAfterCreate.activeThreadId).toBe(threadB.threadId);

      const switchToA = await ctx.client.switchThread({
        projectId,
        threadId: threadA.threadId,
      });
      expect(switchToA.accepted).toBe(true);

      const attachA = await ctx.client.attachTerminalStream(threadA.terminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(attachA.error).toBeNull();
      const streamA = attachA.streamId!;
      let outputA = "";
      const unsubA = ctx.client.onTerminalStreamData(streamA, (chunk) => {
        outputA += decoder.decode(chunk.data, { stream: true });
      });

      const initialMarker = `thread-a-initial-${Date.now()}`;
      ctx.client.sendTerminalStreamInput(streamA, `echo ${initialMarker}\r`);
      await waitForCondition(() => outputA.includes(initialMarker), 10000);
      const detachA = await ctx.client.detachTerminalStream(streamA);
      expect(detachA.success).toBe(true);
      unsubA();

      const switchToB = await ctx.client.switchThread({ projectId, threadId: threadB.threadId });
      expect(switchToB.accepted).toBe(true);

      const backgroundMarker = `thread-a-background-${Date.now()}`;
      ctx.client.sendTerminalInput(threadA.terminalId!, {
        type: "input",
        data: `echo ${backgroundMarker}\r`,
      });

      const switchBackToA = await ctx.client.switchThread({ projectId, threadId: threadA.threadId });
      expect(switchBackToA.accepted).toBe(true);

      const resumedA = await ctx.client.attachTerminalStream(threadA.terminalId!, {
        rows: 24,
        cols: 80,
        resumeOffset: 0,
      });
      expect(resumedA.error).toBeNull();
      let resumedOutput = "";
      const resumedUnsub = ctx.client.onTerminalStreamData(resumedA.streamId!, (chunk) => {
        resumedOutput += decoder.decode(chunk.data, { stream: true });
      });
      await waitForCondition(() => resumedOutput.includes(backgroundMarker), 10000);
      const resumedDetach = await ctx.client.detachTerminalStream(resumedA.streamId!);
      expect(resumedDetach.success).toBe(true);
      resumedUnsub();

      const reconnectSessionKey = `thread-mgmt-reconnect-${Date.now()}`;
      const reconnectClientA = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientSessionKey: reconnectSessionKey,
      });
      await reconnectClientA.connect();
      await reconnectClientA.fetchAgents({
        subscribe: { subscriptionId: `thread-mgmt-reconnect-a-${Date.now()}` },
      });
      const reconnectAttachA = await reconnectClientA.attachTerminalStream(threadA.terminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(reconnectAttachA.error).toBeNull();
      const reconnectDetachA = await reconnectClientA.detachTerminalStream(reconnectAttachA.streamId!);
      expect(reconnectDetachA.success).toBe(true);
      await reconnectClientA.close();

      const reconnectClientB = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientSessionKey: reconnectSessionKey,
      });
      await reconnectClientB.connect();
      await reconnectClientB.fetchAgents({
        subscribe: { subscriptionId: `thread-mgmt-reconnect-b-${Date.now()}` },
      });
      const reconnectAttachB = await reconnectClientB.attachTerminalStream(threadA.terminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(reconnectAttachB.error).toBeNull();
      const reconnectMarker = `thread-reconnect-${Date.now()}`;
      let reconnectOutput = "";
      const reconnectUnsub = reconnectClientB.onTerminalStreamData(reconnectAttachB.streamId!, (chunk) => {
        reconnectOutput += decoder.decode(chunk.data, { stream: true });
      });
      reconnectClientB.sendTerminalStreamInput(reconnectAttachB.streamId!, `echo ${reconnectMarker}\r`);
      await waitForCondition(() => reconnectOutput.includes(reconnectMarker), 10000);
      reconnectUnsub();
      const reconnectDetachB = await reconnectClientB.detachTerminalStream(reconnectAttachB.streamId!);
      expect(reconnectDetachB.success).toBe(true);
      await reconnectClientB.close();

      const listBeforeDelete = await ctx.client.listThreads(projectId);
      const threadBCurrent = listBeforeDelete.threads.find((thread) => thread.threadId === threadB.threadId);
      expect(threadBCurrent).toBeTruthy();

      const threadBWorktree = readThreadWorktreePath(
        path.join(ctx.daemon.paseoHome, "thread-registry.json"),
        projectId,
        threadB.threadId
      );
      expect(threadBWorktree).toBeTruthy();
      writeFileSync(path.join(threadBWorktree!, "dirty.txt"), "dirty\n");

      const deleteBlocked = await ctx.client.deleteThread({
        projectId,
        threadId: threadB.threadId,
      });
      expect(deleteBlocked.accepted).toBe(false);
      expect(deleteBlocked.error).toContain("uncommitted");

      const deleteForced = await ctx.client.deleteThread({
        projectId,
        threadId: threadB.threadId,
        forceDirtyDelete: true,
      });
      expect(deleteForced.accepted).toBe(true);

      const threadsAfterDelete = await ctx.client.listThreads(projectId);
      expect(threadsAfterDelete.threads.some((thread) => thread.threadId === threadB.threadId)).toBe(false);

      await waitForCondition(() => !existsSync(threadBWorktree!), 10000);
      expect(tmuxSessionExists(deriveSessionKey(threadB), ctx.daemon.config.tmuxSocketPath!)).toBe(false);

      const agents = await ctx.client.fetchAgents();
      const deletedThreadAgent = agents.entries.find((entry) => entry.agent.id === threadB.agentId);
      expect(deletedThreadAgent?.agent.status).toBe("closed");
    },
    120000
  );

  test("creates a thread successfully when worktree setup uses bun.lock bootstrap", async () => {
    const bunRepoRoot = createRepoRoot("daemon-thread-mgmt-bun-", {
      withBunWorktreeSetup: true,
    });

    try {
      const projectId = "proj-thread-e2e-bun";
      const projectAdded = await ctx.client.addProject({
        projectId,
        displayName: "Thread E2E Bun Project",
        repoRoot: bunRepoRoot,
        defaultBaseBranch: "main",
      });
      expect(projectAdded.accepted).toBe(true);
      expect(projectAdded.error).toBeNull();

      const createResult = await ctx.client.createThread({
        projectId,
        title: "Thread Bun Bootstrap",
        baseBranch: "main",
        launchConfig: { provider: "opencode" },
      });

      expect(createResult.accepted).toBe(true);
      expect(createResult.error).toBeNull();
      expect(createResult.thread).toBeTruthy();

      const listResult = await ctx.client.listThreads(projectId);
      expect(listResult.error).toBeNull();
      expect(listResult.threads.some((thread) => thread.title === "Thread Bun Bootstrap")).toBe(true);
    } finally {
      rmSync(bunRepoRoot, { recursive: true, force: true });
    }
  });
});

function deriveSessionKey(thread: { projectId: string; threadId: string }): string {
  const sanitize = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const truncate = (value: string, maxLength: number): string =>
    value.length <= maxLength ? value : value.slice(0, maxLength).replace(/-+$/g, "") || value.slice(0, maxLength);
  const shortHash = (value: string): string => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  };
  return `oisin-${truncate(sanitize(thread.projectId), 24)}-${truncate(sanitize(thread.threadId), 24)}-${shortHash(`${thread.projectId}:${thread.threadId}`)}`;
}

function readThreadWorktreePath(
  registryPath: string,
  projectId: string,
  threadId: string
): string | null {
  const raw = JSON.parse(readFileSync(registryPath, "utf8")) as {
    threads?: Array<{
      projectId: string;
      threadId: string;
      links?: { worktreePath?: string | null };
    }>;
  };
  const match = raw.threads?.find(
    (thread) => thread.projectId === projectId && thread.threadId === threadId
  );
  const worktreePath = match?.links?.worktreePath;
  if (!worktreePath) {
    return null;
  }
  return worktreePath;
}

function readStoredAgentConfig(
  paseoHome: string,
  agentId: string
): { extra?: Record<string, unknown> } | null {
  const agentsRoot = path.join(paseoHome, "agents");
  if (!existsSync(agentsRoot)) {
    return null;
  }

  for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(agentsRoot, entry.name, `${agentId}.json`);
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
      config?: { extra?: Record<string, unknown> };
    };
    return parsed.config ?? null;
  }

  return null;
}
