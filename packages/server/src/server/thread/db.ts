import { open, type Database } from "sqlite";
import sqlite3 from "sqlite3";

let _db: Database | null = null;

export type DbHandle = Database;

export async function initDb(dbPath: string): Promise<Database> {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode=WAL");
  await db.exec("PRAGMA foreign_keys=ON");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id    TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      repo_root     TEXT NOT NULL,
      default_base_branch TEXT,
      active_thread_id    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      project_id    TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      thread_id     TEXT NOT NULL,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL CHECK(status IN ('idle','running','error','closed')),
      unread_count  INTEGER NOT NULL DEFAULT 0,
      worktree_path TEXT NOT NULL,
      terminal_id   TEXT,
      launch_config TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      last_active_at  TEXT,
      last_output_at  TEXT,
      last_status_at  TEXT,
      PRIMARY KEY (project_id, thread_id)
    );
  `);
  _db = db;
  return db;
}

export function getDb(): Database {
  if (!_db) {
    throw new Error("DB not initialized - call initDb() first");
  }
  return _db;
}
