import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  createDaemonTestContext,
  type DaemonTestContext,
} from "../test-utils/index.js";
import type { SessionOutboundMessage } from "../messages.js";

type CheckoutDiffUpdatePayload = Extract<
  SessionOutboundMessage,
  { type: "checkout_diff_update" }
>["payload"];

function tmpCwd(): string {
  return mkdtempSync(path.join(tmpdir(), "daemon-e2e-checkout-diff-"));
}

function initGitRepo(cwd: string): void {
  execSync("git init -b main", { cwd, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd, stdio: "pipe" });
}

function commitFile(cwd: string, fileName: string, content: string): void {
  const filePath = path.join(cwd, fileName);
  writeFileSync(filePath, content);
  execSync(`git add "${fileName}"`, { cwd, stdio: "pipe" });
  execSync("git -c commit.gpgsign=false commit -m 'Initial commit'", {
    cwd,
    stdio: "pipe",
  });
}

async function waitForCheckoutDiffUpdate(
  ctx: DaemonTestContext,
  subscriptionId: string,
  predicate: (payload: CheckoutDiffUpdatePayload) => boolean,
  timeoutMs = 15000
): Promise<CheckoutDiffUpdatePayload> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timed out waiting for checkout_diff_update (${subscriptionId})`
        )
      );
    }, timeoutMs);

    const unsubscribe = ctx.client.on("checkout_diff_update", (message) => {
      if (message.type !== "checkout_diff_update") {
        return;
      }
      if (message.payload.subscriptionId !== subscriptionId) {
        return;
      }
      if (!predicate(message.payload)) {
        return;
      }
      clearTimeout(timeout);
      unsubscribe();
      resolve(message.payload);
    });
  });
}

function getGitOrderedDiffPaths(cwd: string): string[] {
  const tracked = execSync("git diff --name-status HEAD", {
    cwd,
    stdio: "pipe",
  })
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = (parts[0] ?? "").trim();
      if (status.startsWith("R") || status.startsWith("C")) {
        return parts[2] ?? "";
      }
      return parts[1] ?? "";
    })
    .filter(Boolean);

  const untracked = execSync("git ls-files --others --exclude-standard", {
    cwd,
    stdio: "pipe",
  })
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...tracked, ...untracked];
}

function expectNonAlphabeticOrder(paths: string[]): void {
  const alphabetical = [...paths].sort((a, b) => a.localeCompare(b));
  expect(paths).not.toEqual(alphabetical);
}

describe("daemon E2E checkout diff subscriptions", () => {
  let ctx: DaemonTestContext;

  beforeEach(async () => {
    ctx = await createDaemonTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  }, 60000);

  test(
    "preserves git file order across initial subscribe, updates, and re-subscribe",
    async () => {
      const cwd = tmpCwd();

      try {
        initGitRepo(cwd);
        commitFile(cwd, "z-tracked-base.txt", "base\n");
        commitFile(cwd, "y-tracked-second.txt", "second\n");

        writeFileSync(path.join(cwd, "z-tracked-base.txt"), "tracked change\n");
        writeFileSync(path.join(cwd, "a-untracked-first.txt"), "untracked change\n");

        const expectedInitialPaths = getGitOrderedDiffPaths(cwd);
        expectNonAlphabeticOrder(expectedInitialPaths);

        const subscriptionId = "checkout-diff-e2e-subscription";
        const initial = await ctx.client.subscribeCheckoutDiff(
          cwd,
          { mode: "uncommitted" },
          { subscriptionId }
        );

        expect(initial.error).toBeNull();
        expect(initial.files.map((file) => file.path)).toEqual(expectedInitialPaths);

        writeFileSync(path.join(cwd, "y-tracked-second.txt"), "second change\n");

        const expectedUpdatePaths = getGitOrderedDiffPaths(cwd);
        expectNonAlphabeticOrder(expectedUpdatePaths);

        const update = await waitForCheckoutDiffUpdate(ctx, subscriptionId, (payload) => {
          const paths = payload.files.map((file) => file.path);
          return JSON.stringify(paths) === JSON.stringify(expectedUpdatePaths);
        });

        expect(update.error).toBeNull();
        expect(update.files.map((file) => file.path)).toEqual(expectedUpdatePaths);

        ctx.client.unsubscribeCheckoutDiff(subscriptionId);

        const revisit = await ctx.client.subscribeCheckoutDiff(
          cwd,
          { mode: "uncommitted" },
          { subscriptionId: "checkout-diff-e2e-subscription-revisit" }
        );

        expect(revisit.error).toBeNull();
        expect(revisit.files.map((file) => file.path)).toEqual(expectedUpdatePaths);

        ctx.client.unsubscribeCheckoutDiff("checkout-diff-e2e-subscription-revisit");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    60000
  );

  test(
    "pushes updates when subscribed from a subdirectory and files change outside it",
    async () => {
      const cwd = tmpCwd();

      try {
        initGitRepo(cwd);
        commitFile(cwd, "base.txt", "base\n");

        const nestedDir = path.join(cwd, "nested", "dir");
        mkdirSync(nestedDir, { recursive: true });

        const subscriptionId = "checkout-diff-subdir-e2e-subscription";
        const initial = await ctx.client.subscribeCheckoutDiff(
          nestedDir,
          { mode: "uncommitted" },
          { subscriptionId }
        );

        expect(initial.error).toBeNull();
        expect(initial.files).toEqual([]);

        writeFileSync(path.join(cwd, "outside-subdir.txt"), "changed outside\n");

        const update = await waitForCheckoutDiffUpdate(
          ctx,
          subscriptionId,
          (payload) => payload.files.some((file) => file.path === "outside-subdir.txt")
        );

        expect(update.error).toBeNull();
        expect(update.files.some((file) => file.path === "outside-subdir.txt")).toBe(true);

        ctx.client.unsubscribeCheckoutDiff(subscriptionId);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    60000
  );
});
