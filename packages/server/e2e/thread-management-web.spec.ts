import { expect, test } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DaemonClient } from "../src/server/test-utils/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Runtime = {
  webUrl: string;
  daemonPort: number;
  daemon: ChildProcess;
  web: ChildProcess;
  repoPath: string;
  paseoHomeRoot: string;
};

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate local port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });
  return child;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function createGitRepo(): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "thread-web-repo-"));
  execSync("git init -b main", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.email 'thread-web@test.local'", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.name 'Thread Web Test'", { cwd: repoPath, stdio: "pipe" });
  await writeFile(path.join(repoPath, "README.md"), "# thread web test\n", "utf8");
  execSync("git add README.md", { cwd: repoPath, stdio: "pipe" });
  execSync("git commit -m 'init'", { cwd: repoPath, stdio: "pipe" });
  return repoPath;
}

async function writePersistedConfig(paseoHome: string, repositoryRoot: string): Promise<void> {
  const configPath = path.join(paseoHome, "config.json");
  await mkdir(paseoHome, { recursive: true });
  const config = {
    version: 1,
    daemon: {
      relay: {
        enabled: false,
      },
    },
    projects: {
      repositories: [
        {
          projectId: "thread-web-project",
          displayName: "Thread Web Project",
          repoRoot: repositoryRoot,
          defaultBaseBranch: "main",
        },
      ],
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function startRuntime(): Promise<Runtime> {
  execSync("bun run --filter @getpaseo/server build", { cwd: repoRoot, stdio: "pipe" });

  const daemonPort = await getAvailablePort();
  const webPort = await getAvailablePort();
  const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "thread-web-runtime-"));
  const paseoHome = path.join(paseoHomeRoot, ".paseo");
  const repoPath = await createGitRepo();

  await writePersistedConfig(paseoHome, repoPath);

  const webUrl = `http://127.0.0.1:${webPort}`;
  const daemonHealthUrl = `http://127.0.0.1:${daemonPort}/api/health`;

  const daemonEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PASEO_HOME: paseoHome,
    PASEO_LISTEN: `127.0.0.1:${daemonPort}`,
    PASEO_CORS_ORIGINS: webUrl,
    PASEO_DICTATION_ENABLED: "0",
    PASEO_VOICE_MODE_ENABLED: "0",
  };

  const webEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    VITE_DAEMON_PORT: String(daemonPort),
  };

  const daemon = spawnProcess("bun", ["run", "--filter", "@getpaseo/server", "start"], daemonEnv);
  await waitForHttpOk(daemonHealthUrl, 60_000);

  const web = spawnProcess(
    "bun",
    [
      "run",
      "--filter",
      "@oisin/web",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    webEnv,
  );
  await waitForHttpOk(webUrl, 60_000);

  return {
    webUrl,
    daemonPort,
    daemon,
    web,
    repoPath,
    paseoHomeRoot,
  };
}

let runtime: Runtime;
let controlClient: DaemonClient;

test.beforeAll(async () => {
  runtime = await startRuntime();
  controlClient = new DaemonClient({
    url: `ws://127.0.0.1:${runtime.daemonPort}/ws`,
    clientSessionKey: `thread-web-control-${Date.now()}`,
  });
  await controlClient.connect();
  await controlClient.fetchAgents({
    subscribe: {
      subscriptionId: `thread-web-control-sub-${Date.now()}`,
    },
  });
});

test.afterAll(async () => {
  const cleanups: Array<Promise<unknown>> = [];
  if (controlClient) {
    cleanups.push(controlClient.close());
  }
  if (runtime?.web) {
    cleanups.push(stopProcess(runtime.web));
  }
  if (runtime?.daemon) {
    cleanups.push(stopProcess(runtime.daemon));
  }
  if (runtime?.repoPath) {
    cleanups.push(rm(runtime.repoPath, { recursive: true, force: true }));
  }
  if (runtime?.paseoHomeRoot) {
    cleanups.push(rm(runtime.paseoHomeRoot, { recursive: true, force: true }));
  }
  await Promise.allSettled(cleanups);
});

test("thread sidebar supports create flow inline errors, active highlight, and Cmd+Arrow wrap", async ({
  page,
}) => {
  await page.goto(runtime.webUrl);

  await expect(page.getByText("Configured Projects")).toBeVisible();
  await expect(page.getByText("Thread Web Project")).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-alpha");
  await page.getByLabel("Base Branch").fill("definitely-not-a-branch");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.locator("[role='dialog']")).toContainText(/branch|error|failed/i);

  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);

  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-beta");
  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);

  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-beta" }),
  ).toBeVisible();

  await page.keyboard.press("Meta+ArrowDown");
  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();

  await page.keyboard.press("Meta+ArrowUp");
  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-beta" }),
  ).toBeVisible();

  await page.keyboard.press("Meta+ArrowUp");
  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();
});

test("background thread closed status updates and emits toast", async ({ page }) => {
  await page.goto(runtime.webUrl);

  await expect(page.locator("[data-sidebar='menu-button']", { hasText: "thread-alpha" })).toBeVisible();
  await expect(page.locator("[data-sidebar='menu-button']", { hasText: "thread-beta" })).toBeVisible();

  await page.locator("[data-sidebar='menu-button']", { hasText: "thread-alpha" }).click();
  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();

  const threadList = await controlClient.listThreads("thread-web-project");
  const backgroundThread = threadList.threads.find((thread) => thread.title === "thread-beta");
  expect(backgroundThread?.agentId).toBeTruthy();

  await controlClient.deleteAgent(backgroundThread!.agentId!);

  const betaRow = page
    .locator("[data-sidebar='menu-button']", { hasText: "thread-beta" })
    .locator("xpath=ancestor::*[@data-sidebar='menu-item'][1]");

  await expect(betaRow).toContainText(/closed|error/i);
  await expect(page.getByText("finished in the background.", { exact: false })).toBeVisible();
});
