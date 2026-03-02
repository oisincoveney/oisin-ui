import path from "node:path";

import {
  deletePaseoWorktreeChecked,
  listPaseoWorktrees,
} from "../../utils/worktree.js";
import { getDb } from "./db.js";

type ReconcileLogger = {
  child(bindings: Record<string, unknown>): ReconcileLogger;
  info(...args: any[]): void;
  warn(...args: any[]): void;
};

type ReconcileOptions = {
  paseoHome: string;
  logger?: ReconcileLogger;
};

export async function runStartupReconciliation(
  opts: ReconcileOptions,
): Promise<void> {
  const log = opts.logger?.child({ module: "startup-reconcile" });
  const db = getDb();

  const projects = await db.all<{ project_id: string; repo_root: string }[]>(
    "SELECT project_id, repo_root FROM projects",
  );

  for (const project of projects) {
    let worktrees: { path: string }[];
    try {
      worktrees = await listPaseoWorktrees({
        cwd: project.repo_root,
        paseoHome: opts.paseoHome,
      });
    } catch {
      continue;
    }

    for (const wt of worktrees) {
      const normalizedPath = path.resolve(wt.path);
      const row = await db.get(
        "SELECT thread_id FROM threads WHERE project_id = ? AND worktree_path = ?",
        project.project_id,
        normalizedPath,
      );

      if (row) {
        continue;
      }

      log?.info(
        { event: "startup_reconcile_orphan", worktreePath: normalizedPath },
        "Deleting orphaned worktree",
      );

      await deletePaseoWorktreeChecked({
        cwd: project.repo_root,
        worktreePath: normalizedPath,
        paseoHome: opts.paseoHome,
        allowDirty: true,
      }).catch((err) => {
        log?.warn(
          { err, worktreePath: normalizedPath },
          "Failed to delete orphaned worktree",
        );
      });
    }
  }
}
