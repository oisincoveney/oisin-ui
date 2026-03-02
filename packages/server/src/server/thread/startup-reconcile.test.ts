import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetDbForTesting, getDb, initDb } from "./db.js";
import { runStartupReconciliation } from "./startup-reconcile.js";
import { deriveWorktreeProjectHash } from "../../utils/worktree.js";

const execFileAsync = promisify(execFile);

describe("runStartupReconciliation", () => {
  let sandboxDir: string;
  let repoRoot: string;
  let paseoHome: string;

  beforeEach(async () => {
    sandboxDir = await mkdtemp(path.join(tmpdir(), "startup-reconcile-"));
    repoRoot = path.join(sandboxDir, "repo");
    paseoHome = path.join(sandboxDir, "paseo");

    await mkdir(repoRoot, { recursive: true });
    await mkdir(paseoHome, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repoRoot });
    await writeFile(path.join(repoRoot, "README.md"), "# test\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });

    _resetDbForTesting();
    await initDb(":memory:");
    const db = getDb();
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO projects (project_id, display_name, repo_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      "proj-1",
      "Test",
      repoRoot,
      now,
      now
    );
  });

  afterEach(async () => {
    _resetDbForTesting();
    await rm(sandboxDir, { recursive: true, force: true });
  });

  async function createPaseoWorktree(name: string, branchName: string): Promise<string> {
    const projectHash = await deriveWorktreeProjectHash(repoRoot);
    const worktreeRoot = path.join(paseoHome, "worktrees", projectHash);
    await mkdir(worktreeRoot, { recursive: true });
    const worktreePath = path.join(worktreeRoot, name);
    await execFileAsync("git", ["worktree", "add", worktreePath, "-b", branchName], {
      cwd: repoRoot,
    });
    return await realpath(worktreePath);
  }

  it("deletes orphan worktree not in DB", async () => {
    const orphanPath = await createPaseoWorktree("orphan", "orphan-branch");
    expect(existsSync(orphanPath)).toBe(true);

    await runStartupReconciliation({ paseoHome });

    expect(existsSync(orphanPath)).toBe(false);
  });

  it("does not delete worktree that exists in DB", async () => {
    const knownPath = await createPaseoWorktree("known", "known-branch");
    const db = getDb();
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO threads (project_id, thread_id, title, status, worktree_path, launch_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      "proj-1",
      "t1",
      "T1",
      "idle",
      knownPath,
      JSON.stringify({ provider: "opencode" }),
      now,
      now
    );

    await runStartupReconciliation({ paseoHome });

    expect(existsSync(knownPath)).toBe(true);
  });

  it("continues when listPaseoWorktrees throws", async () => {
    const db = getDb();
    await db.run("UPDATE projects SET repo_root = ? WHERE project_id = ?", "/nonexistent/path", "proj-1");

    await runStartupReconciliation({ paseoHome });
    expect(true).toBe(true);
  });
});
