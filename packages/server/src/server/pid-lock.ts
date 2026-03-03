import { open, readFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface PidLockInfo {
  pid: number;
  startedAt: string;
  hostname: string;
  uid: number;
  sockPath: string;
}

export class PidLockError extends Error {
  constructor(
    message: string,
    public readonly existingLock?: PidLockInfo
  ) {
    super(message);
    this.name = "PidLockError";
  }
}

const execFileAsync = promisify(execFile);

interface ProcessMetadata {
  startedAt: Date | null;
  command: string | null;
}

export interface AcquirePidLockOptions {
  isPidRunning?: (pid: number) => boolean;
  getProcessMetadata?: (pid: number) => Promise<ProcessMetadata | null>;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getPidFilePath(paseoHome: string): string {
  return join(paseoHome, "paseo.pid");
}

function resolveLockOwnerPid(): number {
  if (typeof process.send === "function") {
    const ppid = process.ppid;
    if (Number.isInteger(ppid) && ppid > 1) {
      return ppid;
    }
  }

  return process.pid;
}

function commandLooksLikePaseoDaemon(command: string | null): boolean {
  if (!command) {
    return false;
  }

  return /\bpaseo\b|dev:server|@oisin\/server|packages\/server/i.test(command);
}

async function getProcessMetadata(pid: number): Promise<ProcessMetadata | null> {
  try {
    const [{ stdout: startedAtRaw }, { stdout: commandRaw }] = await Promise.all([
      execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]),
      execFileAsync("ps", ["-o", "command=", "-p", String(pid)]),
    ]);

    const startedAtString = startedAtRaw.trim();
    const command = commandRaw.trim();
    const startedAt = startedAtString.length > 0 ? new Date(startedAtString) : null;

    return {
      startedAt:
        startedAt && Number.isFinite(startedAt.getTime()) ? startedAt : null,
      command: command.length > 0 ? command : null,
    };
  } catch {
    return null;
  }
}

async function isActivePaseoDaemonOwner(
  lock: PidLockInfo,
  readProcessMetadata: (pid: number) => Promise<ProcessMetadata | null>
): Promise<boolean> {
  const metadata = await readProcessMetadata(lock.pid);
  if (!metadata) {
    return true;
  }

  const lockStartedAt = new Date(lock.startedAt);
  const hasValidLockStartedAt = Number.isFinite(lockStartedAt.getTime());

  if (hasValidLockStartedAt && metadata.startedAt) {
    const startDeltaMs = Math.abs(
      metadata.startedAt.getTime() - lockStartedAt.getTime()
    );
    if (startDeltaMs > 10_000) {
      return false;
    }
  }

  return commandLooksLikePaseoDaemon(metadata.command);
}

export async function acquirePidLock(
  paseoHome: string,
  sockPath: string,
  options: AcquirePidLockOptions = {}
): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);
  const checkPidRunning = options.isPidRunning ?? isPidRunning;
  const readProcessMetadata = options.getProcessMetadata ?? getProcessMetadata;

  // Ensure paseoHome directory exists
  if (!existsSync(paseoHome)) {
    await mkdir(paseoHome, { recursive: true });
  }

  // Try to read existing lock
  let existingLock: PidLockInfo | null = null;
  try {
    const content = await readFile(pidPath, "utf-8");
    existingLock = JSON.parse(content) as PidLockInfo;
  } catch {
    // No existing lock or invalid JSON - that's fine
  }

  // Check if existing lock is stale
  const lockOwnerPid = resolveLockOwnerPid();
  if (existingLock) {
    if (checkPidRunning(existingLock.pid)) {
      if (existingLock.pid === lockOwnerPid) {
        return;
      }

      const activePaseoOwner = await isActivePaseoDaemonOwner(
        existingLock,
        readProcessMetadata
      );
      if (activePaseoOwner) {
        throw new PidLockError(
          `Another Paseo daemon is already running (PID ${existingLock.pid}, started ${existingLock.startedAt})`,
          existingLock
        );
      }

      await unlink(pidPath).catch(() => {});
    } else {
      await unlink(pidPath).catch(() => {});
    }
  }

  // Create new lock with exclusive flag
  const lockInfo: PidLockInfo = {
    pid: lockOwnerPid,
    startedAt: new Date().toISOString(),
    hostname: hostname(),
    uid: process.getuid?.() ?? 0,
    sockPath,
  };

  let fd;
  try {
    fd = await open(pidPath, "wx");
    await fd.write(JSON.stringify(lockInfo));
  } catch (err: any) {
    if (err.code === "EEXIST") {
      // Race condition - another process created the file
      // Re-read and check
      try {
        const content = await readFile(pidPath, "utf-8");
        const raceLock = JSON.parse(content) as PidLockInfo;
        throw new PidLockError(
          `Another Paseo daemon is already running (PID ${raceLock.pid})`,
          raceLock
        );
      } catch (innerErr) {
        if (innerErr instanceof PidLockError) {throw innerErr;}
        throw new PidLockError("Failed to acquire PID lock due to race condition");
      }
    }
    throw err;
  } finally {
    await fd?.close();
  }
}

export async function releasePidLock(paseoHome: string): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);
  const lockOwnerPid = resolveLockOwnerPid();
  try {
    // Only remove if it's our lock
    const content = await readFile(pidPath, "utf-8");
    const lock = JSON.parse(content) as PidLockInfo;
    if (lock.pid === lockOwnerPid) {
      await unlink(pidPath);
    }
  } catch {
    // Ignore errors - lock may already be gone
  }
}

export async function getPidLockInfo(
  paseoHome: string
): Promise<PidLockInfo | null> {
  const pidPath = getPidFilePath(paseoHome);
  try {
    const content = await readFile(pidPath, "utf-8");
    return JSON.parse(content) as PidLockInfo;
  } catch {
    return null;
  }
}

export async function isLocked(
  paseoHome: string
): Promise<{ locked: boolean; info?: PidLockInfo }> {
  const info = await getPidLockInfo(paseoHome);
  if (!info) {
    return { locked: false };
  }
  if (!isPidRunning(info.pid)) {
    return { locked: false, info };
  }
  return { locked: true, info };
}
