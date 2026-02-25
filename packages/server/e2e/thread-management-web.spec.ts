import { expect, test } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
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
  const depPath = path.join(repoPath, "dep");
  const fakeBinPath = path.join(repoPath, ".paseo-test-bin");
  await mkdir(depPath, { recursive: true });
  await mkdir(fakeBinPath, { recursive: true });
  await writeFile(
    path.join(depPath, "package.json"),
    `${JSON.stringify({ name: "dep", version: "1.0.0" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        name: "thread-web-test",
        private: true,
        version: "1.0.0",
        dependencies: { dep: "file:./dep" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(path.join(repoPath, ".gitignore"), "node_modules/\n", "utf8");
  await writeFile(
    path.join(fakeBinPath, "bun"),
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
    { encoding: "utf8", mode: 0o755 },
  );
  execSync("bun install --save-text-lockfile", { cwd: repoPath, stdio: "pipe" });
  await writeFile(
    path.join(repoPath, "paseo.json"),
    `${JSON.stringify(
      {
        worktree: {
          setup: ["PATH=\"$PASEO_WORKTREE_PATH/.paseo-test-bin:$PATH\" bun install --frozen-lockfile"],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const lockfileName = existsSync(path.join(repoPath, "bun.lock")) ? "bun.lock" : "bun.lockb";
  execSync(`git add README.md .gitignore .paseo-test-bin/bun dep/package.json package.json ${lockfileName} paseo.json`, {
    cwd: repoPath,
    stdio: "pipe",
  });
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

test("primary button interactions are stable and actionable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(runtime.webUrl);

  const newThreadButton = page.getByRole("button", { name: "Create new thread" });
  await expect(newThreadButton).toBeVisible();
  await expect(newThreadButton).toBeEnabled();

  const refreshDiffButton = page.getByRole("button", { name: "Refresh diff" });
  const openDiffButton = page.getByRole("button", { name: "Open diff panel" });
  await expect(refreshDiffButton).toBeDisabled();
  await expect(openDiffButton).toBeDisabled();

  await newThreadButton.click();
  const createDialog = page.getByRole("dialog", { name: "Create New Thread" });
  await expect(createDialog).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(createDialog).toHaveCount(0);

  await newThreadButton.click();
  await expect(createDialog).toBeVisible();

  await page.getByLabel("Command", { exact: true }).selectOption("append");
  await expect(page.getByLabel("Arguments")).toBeVisible();
  await page.getByLabel("Command", { exact: true }).selectOption("replace");
  await expect(page.getByLabel("Command + arguments")).toBeVisible();
  await page.getByLabel("Command", { exact: true }).selectOption("default");

  await expect(page.getByRole("button", { name: "Create Thread" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(createDialog).toHaveCount(0);

  const projectHeaderToggle = page.getByRole("button", { name: /Thread Web Project/ });
  await expect(projectHeaderToggle).toBeVisible();
  await projectHeaderToggle.click();
  await projectHeaderToggle.click();

  const sidebarNewThreadButtons = page.getByRole("button", { name: "New Thread" });
  const projectScopedNewThreadButton = sidebarNewThreadButtons.nth(1);
  await expect(projectScopedNewThreadButton).toBeVisible();
  await projectScopedNewThreadButton.click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);

  expect(pageErrors.filter((message) => /Maximum update depth exceeded/i.test(message))).toHaveLength(0);
});

test("thread sidebar supports create flow inline errors, active highlight, and Cmd+Arrow wrap", async ({
  page,
}) => {
  await page.goto(runtime.webUrl);

  await expect(page.getByText("Configured Projects")).toBeVisible();
  await expect(page.getByText("Thread Web Project")).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-alpha");
  await page.getByLabel("Command", { exact: true }).selectOption("append");
  await page.getByLabel("Arguments").fill("--model test-model");
  await page.getByLabel("Base Branch").fill("definitely-not-a-branch");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.locator("[role='dialog']")).toContainText(/branch|error|failed/i);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]", { hasText: /failed|error/i })).toHaveCount(0);
  await expect(page.getByText(/No workspaces found/i)).toHaveCount(0);

  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-beta");
  await page.getByLabel("Command", { exact: true }).selectOption("replace");
  await page.getByLabel("Command + arguments").fill("opencode --model test-model");
  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]", { hasText: /failed|error/i })).toHaveCount(0);
  await expect(page.getByText(/No workspaces found/i)).toHaveCount(0);

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

test("create thread exits pending with timeout error when create response never arrives", async ({ page }) => {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      __dropCreateRequestForTest?: boolean;
      __originalWebSocketSendForTest?: WebSocket["send"];
    };

    if (!globalWindow.__originalWebSocketSendForTest) {
      globalWindow.__originalWebSocketSendForTest = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data: Parameters<WebSocket["send"]>[0]): void {
        if (globalWindow.__dropCreateRequestForTest && typeof data === "string") {
          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              message?: { type?: string };
            };
            if (parsed.type === "session" && parsed.message?.type === "thread_create_request") {
              return;
            }
          } catch {
            // fall through
          }
        }

        globalWindow.__originalWebSocketSendForTest?.call(this, data);
      };
    }

    globalWindow.__dropCreateRequestForTest = true;
  });

  await page.goto(runtime.webUrl);
  await expect(page.getByText("Thread Web Project")).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-timeout");
  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();

  await expect(page.getByRole("button", { name: "Creating…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Creating…" })).toHaveCount(0, { timeout: 12_000 });
  await expect(page.getByRole("button", { name: "Create Thread" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toContainText(
    "Create Thread timed out waiting for daemon response. Confirm daemon health and try again.",
  );
});

test("background thread delete updates sidebar state", async ({ page }) => {
  const existing = await controlClient.listThreads("thread-web-project");
  if (!existing.threads.some((thread) => thread.title === "thread-alpha")) {
    await controlClient.createThread({
      projectId: "thread-web-project",
      title: "thread-alpha",
      baseBranch: "main",
      launchConfig: { provider: "opencode" },
    });
  }
  if (!existing.threads.some((thread) => thread.title === "thread-beta")) {
    await controlClient.createThread({
      projectId: "thread-web-project",
      title: "thread-beta",
      baseBranch: "main",
      launchConfig: { provider: "opencode" },
    });
  }

  await page.goto(runtime.webUrl);
  await page.reload();

  await expect(page.locator("[data-sidebar='menu-button']", { hasText: "thread-alpha" })).toBeVisible();
  await expect(page.locator("[data-sidebar='menu-button']", { hasText: "thread-beta" })).toBeVisible();

  await page.locator("[data-sidebar='menu-button']", { hasText: "thread-alpha" }).click();
  await expect(
    page.locator("[data-sidebar='menu-button'][data-active='true']", { hasText: "thread-alpha" }),
  ).toBeVisible();

  const betaRow = page
    .locator("[data-sidebar='menu-button']", { hasText: "thread-beta" })
    .locator("xpath=ancestor::*[@data-sidebar='menu-item'][1]");
  await expect(betaRow).toBeVisible();
  await betaRow.hover();

  await page.getByRole("button", { name: "Delete thread-beta" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete Thread" });
  await expect(deleteDialog).toBeVisible();
  await page.getByRole("button", { name: "Delete Thread" }).click();

  await expect(betaRow).toHaveCount(0);
});

test("create thread exits pending immediately with disconnected error when websocket is offline", async ({ page }) => {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      __trackSocketInstalledForTest?: boolean;
      __lastSocketForTest?: WebSocket;
    };

    if (globalWindow.__trackSocketInstalledForTest) {
      return;
    }

    const OriginalWebSocket = window.WebSocket;
    const TrackingWebSocket = function (...args: ConstructorParameters<typeof WebSocket>) {
      const socket = new OriginalWebSocket(...args);
      globalWindow.__lastSocketForTest = socket;
      return socket;
    } as unknown as typeof WebSocket;

    TrackingWebSocket.prototype = OriginalWebSocket.prototype;
    Object.setPrototypeOf(TrackingWebSocket, OriginalWebSocket);

    window.WebSocket = TrackingWebSocket;
    globalWindow.__trackSocketInstalledForTest = true;
  });

  await page.goto(runtime.webUrl);
  await expect(page.getByText("Thread Web Project")).toBeVisible();

  await stopProcess(runtime.daemon);
  await page.evaluate(() => {
    const socket = (window as Window & { __lastSocketForTest?: WebSocket }).__lastSocketForTest;
    socket?.close();
  });
  await expect.poll(
    async () => {
      return await page.evaluate(() => {
        const socket = (window as Window & { __lastSocketForTest?: WebSocket }).__lastSocketForTest;
        return socket?.readyState ?? -1;
      });
    },
    {
      timeout: 10_000,
    },
  ).not.toBe(WebSocket.OPEN);

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill("thread-disconnected");
  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();

  await expect(page.getByRole("button", { name: "Creating…" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Thread" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toContainText(
    "Create Thread failed because the daemon connection is offline. Wait for reconnect, then try again.",
  );
});
