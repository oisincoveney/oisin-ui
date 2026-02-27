import { expect, test } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Runtime = {
  webUrl: string;
  daemon: ChildProcess;
  web: ChildProcess;
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
      // keep polling until timeout
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
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function startRuntime(): Promise<Runtime> {
  execSync("bun run --filter @getpaseo/server build", { cwd: repoRoot, stdio: "pipe" });

  const daemonPort = await getAvailablePort();
  const webPort = await getAvailablePort();
  const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "terminal-web-smoke-"));
  const paseoHome = path.join(paseoHomeRoot, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  await writeFile(
    path.join(paseoHome, "config.json"),
    `${JSON.stringify(
      {
        version: 1,
        daemon: { relay: { enabled: false } },
        projects: {
          repositories: [
            {
              projectId: "terminal-web-project",
              displayName: "Terminal Web Project",
              repoRoot,
              defaultBaseBranch: "main",
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const webUrl = `http://127.0.0.1:${webPort}`;
  const daemonHealthUrl = `http://127.0.0.1:${daemonPort}/api/health`;
  const daemonListen = `127.0.0.1:${daemonPort}`;

  const daemonEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PASEO_HOME: paseoHome,
    PASEO_LISTEN: daemonListen,
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
    daemon,
    web,
    paseoHomeRoot,
  };
}

let runtime: Runtime;

test.beforeAll(async () => {
  runtime = await startRuntime();
});

test.afterAll(async () => {
  if (!runtime) {
    return;
  }

  await Promise.allSettled([
    stopProcess(runtime.web),
    stopProcess(runtime.daemon),
    rm(runtime.paseoHomeRoot, { recursive: true, force: true }),
  ]);
});

test("terminal becomes interactive and renders command output", async ({ page }) => {
  await page.goto(runtime.webUrl);

  await expect(page.locator(".xterm")).toBeVisible();
  await expect(page.getByText("Connecting to daemon...", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Terminal disconnected.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("reason:", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByRole("combobox", { name: "Project" }).selectOption({ index: 0 });
  await page.getByRole("textbox", { name: "Thread Name" }).fill(`terminal-smoke-${Date.now()}`);
  const baseBranch = page.getByRole("combobox", { name: "Base Branch" });
  await expect(baseBranch).toBeEnabled();
  await baseBranch.fill("main");
  await page.getByRole("button", { name: "Create Thread", exact: true }).click();
  await expect(page.getByText("No active thread", { exact: false })).toHaveCount(0);

  const terminalInput = page.getByRole("textbox", { name: "Terminal input" });
  await page.locator(".xterm-screen").click();
  await expect(terminalInput).toBeFocused();

  const marker = `terminal-web-smoke-${Date.now()}`;
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press("Enter");

  await expect.poll(async () => {
    return await page
      .locator(".xterm-rows")
      .evaluate((el) => el.textContent ?? "");
  }).toContain(marker);
});
