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

function createRepoRoot(
  prefix: string,
  options?: {
    withBunFrozenMismatchSetup?: boolean;
    withCanonicalWorktreeSetup?: boolean;
  }
): string {
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

  if (options?.withBunFrozenMismatchSetup) {
    const depDir = path.join(repoRoot, "dep");
    const fakeBinDir = path.join(repoRoot, ".paseo-test-bin");
    mkdirSync(depDir, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });
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
    writeFileSync(
      path.join(fakeBinDir, "bun"),
      [
        "#!/usr/bin/env bash",
        "set -eu",
        "marker=node_modules/.paseo-frozen-lock-mismatch-once",
        "if [[ \"${1:-}\" == \"install\" && \"${2:-}\" == \"--frozen-lockfile\" && ! -f \"$marker\" ]]; then",
        "  printf 'error: lockfile had changes, but lockfile is frozen\\n' >&2",
        "  printf 'mismatch-first-pass\\n' > bun.lock",
        "  mkdir -p node_modules",
        "  touch \"$marker\"",
        "  exit 1",
        "fi",
        "if [[ \"${1:-}\" == \"install\" ]]; then",
        "  printf 'mismatch-retry-pass\\n' > bun.lock",
        "  mkdir -p node_modules",
        "  exit 0",
        "fi",
        "printf 'unexpected bun args: %s\\n' \"$*\" >&2",
        "exit 2",
        "",
      ].join("\n"),
      { mode: 0o755 }
    );
    execSync("bun install --save-text-lockfile", { cwd: repoRoot, stdio: "pipe" });
    writeFileSync(
      path.join(repoRoot, "paseo.json"),
      `${JSON.stringify(
        {
          worktree: {
            setup: [
              "PATH=\"$PASEO_WORKTREE_PATH/.paseo-test-bin:$PATH\" bun install --frozen-lockfile",
            ],
          },
        },
        null,
        2
      )}\n`
    );
    const lockfileName = existsSync(path.join(repoRoot, "bun.lock")) ? "bun.lock" : "bun.lockb";
    execSync(`git add .gitignore .paseo-test-bin/bun dep/package.json package.json ${lockfileName} paseo.json`, {
      cwd: repoRoot,
      stdio: "pipe",
    });
    execSync("git commit -m 'seed bun worktree setup'", { cwd: repoRoot, stdio: "pipe" });
  }

  if (options?.withCanonicalWorktreeSetup) {
    const depDir = path.join(repoRoot, "dep");
    mkdirSync(depDir, { recursive: true });
    writeFileSync(path.join(depDir, "package.json"), `${JSON.stringify({ name: "dep", version: "1.0.0" }, null, 2)}\n`);
    writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "thread-e2e-canonical-setup",
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
      `${JSON.stringify(
        {
          worktree: {
            setup: ["bun install --frozen-lockfile"],
          },
        },
        null,
        2
      )}\n`
    );
    const lockfileName = existsSync(path.join(repoRoot, "bun.lock")) ? "bun.lock" : "bun.lockb";
    execSync(`git add .gitignore dep/package.json package.json ${lockfileName} paseo.json`, {
      cwd: repoRoot,
      stdio: "pipe",
    });
    execSync("git commit -m 'seed canonical setup commands'", { cwd: repoRoot, stdio: "pipe" });
  }

  return repoRoot;
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 25,
  label = "condition"
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition: ${label}`);
}

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const originalShell = process.env.SHELL;

  beforeEach(async () => {
    process.env.SHELL = "/bin/bash";
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
    if (originalShell) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  }, 60000);

  test("post-connect readiness barrier keeps first ping/fetchAgents RPCs bounded", async () => {
    const attempts = 5;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const immediateClient = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientSessionKey: `thread-mgmt-first-rpc-${Date.now()}-${attempt}`,
        reconnect: { enabled: false },
      });

      try {
        await immediateClient.connect();

        const readinessStartedAt = Date.now();
        await immediateClient.waitForPostConnectReady({
          timeoutMs: 1500,
          probeTimeoutMs: 300,
          retryDelayMs: 10,
        });
        const readinessElapsedMs = Date.now() - readinessStartedAt;

        const pingStartedAt = Date.now();
        const ping = await immediateClient.ping({ timeoutMs: 1000 });
        const pingElapsedMs = Date.now() - pingStartedAt;

        const fetchStartedAt = Date.now();
        const response = await immediateClient.fetchAgents({
          subscribe: { subscriptionId: `thread-mgmt-first-rpc-sub-${Date.now()}-${attempt}` },
        });
        const fetchElapsedMs = Date.now() - fetchStartedAt;

        expect(readinessElapsedMs).toBeLessThan(1500);
        expect(ping.requestId).toBeTruthy();
        expect(ping.rttMs).toBeGreaterThanOrEqual(0);
        expect(pingElapsedMs).toBeLessThan(1200);
        expect(response.subscriptionId).toBeTruthy();
        expect(response.entries).toBeDefined();
        expect(fetchElapsedMs).toBeLessThan(2000);
      } finally {
        await immediateClient.close();
      }
    }
  });

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
      const threadA = createA.thread!;

      let threadAWithAgent = threadA;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const listed = await ctx.client.listThreads(projectId);
        const candidate = listed.threads.find((thread) => thread.threadId === threadA.threadId) ?? null;
        if (candidate?.agentId) {
          threadAWithAgent = candidate;
          break;
        }
        await waitFor(100);
      }
      expect(threadAWithAgent.agentId).toBeTruthy();
      const threadATerminalId = threadAWithAgent.terminalId ?? threadA.terminalId;
      expect(threadATerminalId).toBeTruthy();

      const threadAWorktree = readThreadWorktreePath(
        path.join(ctx.daemon.paseoHome, "thread-registry.json"),
        projectId,
        threadA.threadId
      );
      expect(threadAWorktree).toBeTruthy();
      await waitForCondition(() => existsSync(path.join(threadAWorktree!, "release-only.txt")), 20000);

      const threadAConfig = readStoredAgentConfig(ctx.daemon.paseoHome, threadAWithAgent.agentId!);
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

      const attachA = await ctx.client.attachTerminalStream(threadATerminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(attachA.error).toBeNull();
      const activeThreadATerminalId = attachA.terminalId ?? threadATerminalId;
      const streamA = attachA.streamId!;
      let outputA = "";
      const unsubA = ctx.client.onTerminalStreamData(streamA, (chunk) => {
        outputA += decoder.decode(chunk.data, { stream: true });
      });

      await waitForCondition(
        () => /\$\s*$|#\s*$|%\s*$/.test(outputA),
        10000,
        25,
        "thread A shell prompt"
      );

      expect(outputA.length).toBeGreaterThan(0);
      const detachA = await ctx.client.detachTerminalStream(streamA);
      expect(detachA.success).toBe(true);
      unsubA();

      const switchToB = await ctx.client.switchThread({ projectId, threadId: threadB.threadId });
      expect(switchToB.accepted).toBe(true);

      const switchBackToA = await ctx.client.switchThread({ projectId, threadId: threadA.threadId });
      expect(switchBackToA.accepted).toBe(true);

      const listedBeforeResume = await ctx.client.listThreads(projectId);
      const latestThreadA = listedBeforeResume.threads.find((thread) => thread.threadId === threadA.threadId) ?? null;
      const latestThreadATerminalId = latestThreadA?.terminalId ?? activeThreadATerminalId;
      expect(latestThreadATerminalId).toBeTruthy();

      const resumedA = await ctx.client.attachTerminalStream(latestThreadATerminalId!, {
        rows: 24,
        cols: 80,
        resumeOffset: 0,
      });
      expect(resumedA.error).toBeNull();
      const resumedStreamId = resumedA.streamId!;
      let resumedOutput = "";
      const resumedUnsub = ctx.client.onTerminalStreamData(resumedA.streamId!, (chunk) => {
        resumedOutput += decoder.decode(chunk.data, { stream: true });
      });
      await waitForCondition(
        () => /\$\s*$|#\s*$|%\s*$/.test(resumedOutput),
        10000,
        25,
        "resumed shell prompt"
      );
      expect(resumedOutput.length).toBeGreaterThan(0);
      const resumedDetach = await ctx.client.detachTerminalStream(resumedStreamId);
      expect(resumedDetach.success).toBe(true);
      resumedUnsub();

      const reconnectSessionKey = `thread-mgmt-reconnect-${Date.now()}`;
      const reconnectClientA = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientSessionKey: reconnectSessionKey,
        reconnect: { enabled: false },
      });
      await reconnectClientA.connect();
      await reconnectClientA.fetchAgents({
        subscribe: { subscriptionId: `thread-mgmt-reconnect-a-${Date.now()}` },
      });
      const reconnectAttachA = await reconnectClientA.attachTerminalStream(latestThreadATerminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(reconnectAttachA.error).toBeNull();
      const reconnectTerminalId = reconnectAttachA.terminalId ?? latestThreadATerminalId;
      const reconnectDetachA = await reconnectClientA.detachTerminalStream(reconnectAttachA.streamId!);
      expect(reconnectDetachA.success).toBe(true);
      await reconnectClientA.close();

      const reconnectClientB = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientSessionKey: reconnectSessionKey,
        reconnect: { enabled: false },
      });
      await reconnectClientB.connect();
      await reconnectClientB.fetchAgents({
        subscribe: { subscriptionId: `thread-mgmt-reconnect-b-${Date.now()}` },
      });
      const reconnectAttachB = await reconnectClientB.attachTerminalStream(reconnectTerminalId!, {
        rows: 24,
        cols: 80,
      });
      expect(reconnectAttachB.error).toBeNull();
      let reconnectOutput = "";
      const reconnectUnsub = reconnectClientB.onTerminalStreamData(reconnectAttachB.streamId!, (chunk) => {
        reconnectOutput += decoder.decode(chunk.data, { stream: true });
      });
      await waitForCondition(
        () => /\$\s*$|#\s*$|%\s*$/.test(reconnectOutput),
        10000,
        25,
        "reconnect shell prompt"
      );
      expect(reconnectOutput.length).toBeGreaterThan(0);
      reconnectUnsub();
      const reconnectDetachB = await reconnectClientB.detachTerminalStream(reconnectAttachB.streamId!);
      expect(reconnectDetachB.success).toBe(true);
      await reconnectClientB.close();

      const listBeforeDelete = await ctx.client.listThreads(projectId);
      const threadBCurrent = listBeforeDelete.threads.find((thread) => thread.threadId === threadB.threadId);
      expect(threadBCurrent).toBeTruthy();

      let threadBAgentId = threadBCurrent?.agentId ?? null;
      for (let attempt = 0; attempt < 80 && !threadBAgentId; attempt += 1) {
        const listed = await ctx.client.listThreads(projectId);
        threadBAgentId =
          listed.threads.find((thread) => thread.threadId === threadB.threadId)?.agentId ?? null;
        if (!threadBAgentId) {
          await waitFor(100);
        }
      }

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

      await waitForCondition(() => !existsSync(threadBWorktree!), 10000, 25, "thread B worktree deleted");
      expect(tmuxSessionExists(deriveSessionKey(threadB), ctx.daemon.config.tmuxSocketPath!)).toBe(false);

      const agents = await ctx.client.fetchAgents();
      if (threadBAgentId) {
        const deletedThreadAgent = agents.entries.find((entry) => entry.agent.id === threadBAgentId);
        expect(deletedThreadAgent?.agent.status).toBe("closed");
      }
    },
    120000
  );

  test("bounds attach failures and does not emit infinite retry state for missing terminals", async () => {
    const projectId = `proj-thread-attach-bounds-${Date.now()}`;
    const projectAdded = await ctx.client.addProject({
      projectId,
      displayName: "Thread Attach Bounds Project",
      repoRoot,
      defaultBaseBranch: "main",
    });
    expect(projectAdded.accepted).toBe(true);
    expect(projectAdded.error).toBeNull();

    const thread = await ctx.client.createThread({
      projectId,
      title: "Thread Attach Bounds",
      baseBranch: "main",
      launchConfig: { provider: "opencode" },
    });
    expect(thread.accepted).toBe(true);

    const statusUpdates: Array<{ threadId: string; status: string; at: number }> = [];
    const unsubStatus = ctx.client.onThreadStatusUpdated((payload) => {
      statusUpdates.push({ threadId: payload.threadId, status: payload.status, at: Date.now() });
    });

    const missingTerminalId = `missing-terminal-${Date.now()}`;
    const attemptDurations: number[] = [];

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const startedAt = Date.now();
        const response = await ctx.client.attachTerminalStream(missingTerminalId, {
          rows: 24,
          cols: 80,
        });
        const durationMs = Date.now() - startedAt;
        attemptDurations.push(durationMs);
        expect(response.error).toBeTruthy();
        expect(response.streamId).toBeNull();
      }

      const maxDuration = Math.max(...attemptDurations);
      const totalDuration = attemptDurations.reduce((sum, value) => sum + value, 0);
      expect(maxDuration).toBeLessThan(1500);
      expect(totalDuration).toBeLessThan(6000);

      const threadId = thread.thread!.threadId;
      const threadStatusUpdates = statusUpdates.filter((update) => update.threadId === threadId);
      expect(threadStatusUpdates.filter((update) => update.status === "running")).toHaveLength(0);
    } finally {
      unsubStatus();
    }
  });

  test("active delete clears thread and stale attach attempts remain bounded", async () => {
    const projectId = `proj-thread-delete-bounds-${Date.now()}`;
    const projectAdded = await ctx.client.addProject({
      projectId,
      displayName: "Thread Delete Bounds Project",
      repoRoot,
      defaultBaseBranch: "main",
    });
    expect(projectAdded.accepted).toBe(true);
    expect(projectAdded.error).toBeNull();

    const createResult = await ctx.client.createThread({
      projectId,
      title: "Thread Delete Active",
      baseBranch: "main",
      launchConfig: { provider: "opencode" },
    });
    expect(createResult.accepted).toBe(true);
    const createdThread = createResult.thread!;
    const terminalId = createdThread.terminalId!;

    const updates: Array<{ threadId: string; status: string; at: number }> = [];
    const unsubStatus = ctx.client.onThreadStatusUpdated((payload) => {
      updates.push({ threadId: payload.threadId, status: payload.status, at: Date.now() });
    });

    try {
      const deleteResult = await ctx.client.deleteThread({
        projectId,
        threadId: createdThread.threadId,
      });
      expect(deleteResult.accepted).toBe(true);

      const deletedAt = Date.now();
      let activeCleared = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const listed = await ctx.client.listThreads(projectId);
        if ((listed.activeThreadId ?? null) === null) {
          activeCleared = true;
          break;
        }
        await waitFor(25);
      }
      expect(activeCleared).toBe(true);

      const postDeleteDurations: number[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const startedAt = Date.now();
        const response = await ctx.client.attachTerminalStream(terminalId, {
          rows: 24,
          cols: 80,
        });
        postDeleteDurations.push(Date.now() - startedAt);
        expect(response.error).toBeTruthy();
        expect(response.streamId).toBeNull();

        const listed = await ctx.client.listThreads(projectId);
        expect(listed.threads.some((entry) => entry.threadId === createdThread.threadId)).toBe(false);
        expect(listed.activeThreadId ?? null).toBeNull();
      }

      expect(Math.max(...postDeleteDurations)).toBeLessThan(1500);

      await waitFor(300);
      const postDeleteUpdates = updates.filter(
        (update) => update.threadId === createdThread.threadId && update.at >= deletedAt
      );
      expect(postDeleteUpdates.filter((update) => update.status === "running")).toHaveLength(0);
      expect(postDeleteUpdates.length).toBeLessThanOrEqual(1);
    } finally {
      unsubStatus();
    }
  });

  test("creates a thread successfully when bun frozen-lockfile mismatch is recovered", async () => {
    const bunRepoRoot = createRepoRoot("daemon-thread-mgmt-bun-", {
      withBunFrozenMismatchSetup: true,
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

      const createdWorktreePath = readThreadWorktreePath(
        path.join(ctx.daemon.paseoHome, "thread-registry.json"),
        projectId,
        createResult.thread!.threadId
      );
      expect(createdWorktreePath).toBeTruthy();
      await waitForCondition(
        () => existsSync(path.join(createdWorktreePath!, "node_modules/.paseo-frozen-lock-mismatch-once")),
        20000,
        25,
        "bun frozen lockfile mismatch marker"
      );
      expect(existsSync(path.join(createdWorktreePath!, "node_modules/.paseo-frozen-lock-mismatch-once"))).toBe(true);

      await waitForCondition(
        () =>
          execSync("git status --porcelain=v1 --untracked-files=no", {
            cwd: createdWorktreePath!,
            stdio: "pipe",
          })
            .toString()
            .trim() === "",
        20000,
        25,
        "clean tracked status after bun fallback restore"
      );

      const trackedStatus = execSync("git status --porcelain=v1 --untracked-files=no", {
        cwd: createdWorktreePath!,
        stdio: "pipe",
      })
        .toString()
        .trim();
      expect(trackedStatus).toBe("");

      const listResult = await ctx.client.listThreads(projectId);
      expect(listResult.error).toBeNull();
      expect(listResult.threads.some((thread) => thread.title === "Thread Bun Bootstrap")).toBe(true);
    } finally {
      rmSync(bunRepoRoot, { recursive: true, force: true });
    }
  });

  test("create-thread setup does not surface npm workspace resolution failures", async () => {
    const canonicalSetupRepoRoot = createRepoRoot("daemon-thread-mgmt-canonical-", {
      withCanonicalWorktreeSetup: true,
    });

    try {
      const projectId = "proj-thread-e2e-canonical";
      const projectAdded = await ctx.client.addProject({
        projectId,
        displayName: "Thread E2E Canonical Setup Project",
        repoRoot: canonicalSetupRepoRoot,
        defaultBaseBranch: "main",
      });
      expect(projectAdded.accepted).toBe(true);
      expect(projectAdded.error).toBeNull();

      const createResult = await ctx.client.createThread({
        projectId,
        title: "Thread Canonical Setup",
        baseBranch: "main",
        launchConfig: { provider: "opencode" },
      });

      expect(createResult.accepted).toBe(true);
      expect(createResult.error).toBeNull();
      expect(createResult.error ?? "").not.toContain("No workspaces found");
      expect(createResult.thread).toBeTruthy();
    } finally {
      rmSync(canonicalSetupRepoRoot, { recursive: true, force: true });
    }
  });

  test("ensure-default response includes real projectId and resolvedThreadId after thread creation", async () => {
    const projectId = `proj-ensure-default-meta-${Date.now()}`;
    const projectAdded = await ctx.client.addProject({
      projectId,
      displayName: "Ensure Default Metadata Project",
      repoRoot,
      defaultBaseBranch: "main",
    });
    expect(projectAdded.accepted).toBe(true);
    expect(projectAdded.error).toBeNull();

    const createResult = await ctx.client.createThread({
      projectId,
      title: "Thread Ensure Default",
      baseBranch: "main",
      launchConfig: { provider: "opencode" },
    });
    expect(createResult.accepted).toBe(true);
    expect(createResult.thread).toBeTruthy();
    const createdThread = createResult.thread!;

    const ensureResponse = await ctx.client.ensureDefaultTerminal();
    expect(ensureResponse.error).toBeNull();
    expect(ensureResponse.terminal).not.toBeNull();
    expect(ensureResponse.projectId).toBe(createdThread.projectId);
    expect(ensureResponse.resolvedThreadId).toBe(createdThread.threadId);
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
