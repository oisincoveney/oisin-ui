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

const E2E_HIGHLIGHT_FILE = ".paseo-diff-panel-e2e.ts";
const RENAME_SOURCE_FILE = "README.md";
const RENAME_TARGET_FILE = "README.rename-e2e.md";

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
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "diff-panel-repo-"));
  execSync("git init -b main", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.email 'diff-panel@test.local'", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.name 'Diff Panel Test'", { cwd: repoPath, stdio: "pipe" });
  await writeFile(path.join(repoPath, "README.md"), "# diff panel test\n", "utf8");
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
        name: "diff-panel-test",
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
          projectId: "diff-panel-project",
          displayName: "Diff Panel Project",
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
  const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "diff-panel-runtime-"));
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

async function createThreadViaUi(page: import("@playwright/test").Page, title: string): Promise<void> {
  const submittedAt = Date.now();
  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("Thread Name").fill(title);
  await page.getByLabel("Base Branch").fill("main");
  await page.getByRole("button", { name: "Create Thread" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Thread" })).toHaveCount(0);
  await expect(page.locator("[data-sidebar='menu-button']", { hasText: title })).toBeVisible();
  await expect(page.getByText("No active thread")).toHaveCount(0);
  await expect(page.getByText(/Reattaching terminal \(attempt \d+\)/)).toHaveCount(0);

  const createLatencyMs = Date.now() - submittedAt;
  expect(createLatencyMs).toBeLessThan(10_000);
}

async function runTerminalCommand(page: import("@playwright/test").Page, command: string): Promise<void> {
  const input = page.locator(".xterm-helper-textarea").first();
  await input.focus();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

let runtime: Runtime;
let controlClient: DaemonClient;

test.beforeAll(async () => {
  runtime = await startRuntime();
  controlClient = new DaemonClient({
    url: `ws://127.0.0.1:${runtime.daemonPort}/ws`,
    clientSessionKey: `diff-panel-control-${Date.now()}`,
  });
  await controlClient.connect();
  await controlClient.fetchAgents({
    subscribe: {
      subscriptionId: `diff-panel-control-sub-${Date.now()}`,
    },
  });
});

test.afterAll(async () => {
  const cleanups: Array<Promise<unknown>> = [];
  if (controlClient) cleanups.push(controlClient.close());
  if (runtime?.web) cleanups.push(stopProcess(runtime.web));
  if (runtime?.daemon) cleanups.push(stopProcess(runtime.daemon));
  if (runtime?.repoPath) cleanups.push(rm(runtime.repoPath, { recursive: true, force: true }));
  if (runtime?.paseoHomeRoot) cleanups.push(rm(runtime.paseoHomeRoot, { recursive: true, force: true }));
  await Promise.allSettled(cleanups);
});

test.describe("diff panel regressions", () => {
  test("renders collapsed metadata rows, refreshes from terminal edits, and stays read-only", async ({ page }) => {
    await page.goto(runtime.webUrl);

    // Create active thread via UI — fixture guarantees openPanelButton will be enabled
    await createThreadViaUi(page, "diff-panel-active-thread");

    // Wait for terminal to be ready (xterm attached)
    await expect(page.locator(".xterm-helper-textarea").first()).toBeVisible({ timeout: 30_000 });

    const openPanelButton = page.getByRole("button", { name: "Open diff panel" });
    await expect(openPanelButton).toBeEnabled(); // Hard assertion — no skip
    await openPanelButton.click();

    const panel = page.getByTestId("diff-panel");
    await expect(panel).toBeVisible();

    await runTerminalCommand(page, `printf "const diffPanelValue = 123\\n" > ${E2E_HIGHLIGHT_FILE}`);
    await page.waitForTimeout(750);

    const refreshButton = panel.getByTestId("diff-refresh-button");
    await refreshButton.click();

    const highlightedRowPath = panel.getByTestId("diff-file-path").filter({ hasText: E2E_HIGHLIGHT_FILE });
    await expect(highlightedRowPath).toBeVisible();

    const allPaths = await panel.getByTestId("diff-file-path").allTextContents();
    expect(allPaths.every((p) => p.trim().length > 0)).toBeTruthy();

    const highlightedSection = panel.getByTestId("diff-file-section").filter({ has: highlightedRowPath });
    await expect(highlightedSection.getByTestId("diff-file-content")).toBeHidden();
    await highlightedSection.getByTestId("diff-file-row").click();
    await expect(highlightedSection.getByTestId("diff-file-content")).toBeVisible();
    const highlightClassMatches = await highlightedSection
      .locator(".hljs-keyword, .hljs-variable, .hljs-title")
      .count();
    expect(highlightClassMatches).toBeGreaterThan(0);

    await runTerminalCommand(
      page,
      `if [ -f ${RENAME_TARGET_FILE} ]; then mv ${RENAME_TARGET_FILE} ${RENAME_SOURCE_FILE}; fi`,
    );
    await runTerminalCommand(page, `mv ${RENAME_SOURCE_FILE} ${RENAME_TARGET_FILE}`);
    await page.waitForTimeout(300);
    await refreshButton.click();

    const renameLabel = `${RENAME_SOURCE_FILE} -> ${RENAME_TARGET_FILE}`;
    await expect(panel.getByTestId("diff-file-path").filter({ hasText: renameLabel })).toBeVisible();

    await runTerminalCommand(
      page,
      `if [ -f ${RENAME_TARGET_FILE} ]; then mv ${RENAME_TARGET_FILE} ${RENAME_SOURCE_FILE}; fi`,
    );
    await runTerminalCommand(page, `rm -f ${E2E_HIGHLIGHT_FILE}`);
    await page.waitForTimeout(300);
    await refreshButton.click();

    await expect(
      panel.locator('textarea, [contenteditable="true"], button:has-text("Edit"), button:has-text("Save")'),
    ).toHaveCount(0);
  });
});
