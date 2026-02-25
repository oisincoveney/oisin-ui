import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquirePidLock, PidLockError, type PidLockInfo } from "./pid-lock.js";

function createTmpHome(): string {
  return mkdtempSync(join(tmpdir(), "paseo-pid-lock-"));
}

function readLock(home: string): PidLockInfo {
  return JSON.parse(readFileSync(join(home, "paseo.pid"), "utf-8")) as PidLockInfo;
}

describe("acquirePidLock", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes) {
      rmSync(home, { recursive: true, force: true });
    }
    homes.length = 0;
  });

  it("replaces stale lock when owning pid is dead", async () => {
    const home = createTmpHome();
    homes.push(home);

    writeFileSync(
      join(home, "paseo.pid"),
      JSON.stringify({
        pid: 999_991,
        startedAt: "2026-02-20T00:00:00.000Z",
        hostname: "old-host",
        uid: 1,
        sockPath: "0.0.0.0:6767",
      } satisfies PidLockInfo)
    );

    await acquirePidLock(home, "0.0.0.0:6767", {
      isPidRunning: () => false,
    });

    const lock = readLock(home);
    expect(lock.pid).toBe(process.pid);
    expect(lock.sockPath).toBe("0.0.0.0:6767");
  });

  it("replaces lock when pid was reused by non-daemon process", async () => {
    const home = createTmpHome();
    homes.push(home);

    writeFileSync(
      join(home, "paseo.pid"),
      JSON.stringify({
        pid: 42_424,
        startedAt: "2026-02-25T01:00:00.000Z",
        hostname: "old-host",
        uid: 1,
        sockPath: "0.0.0.0:6767",
      } satisfies PidLockInfo)
    );

    await acquirePidLock(home, "0.0.0.0:6767", {
      isPidRunning: () => true,
      getProcessMetadata: async () => ({
        startedAt: new Date("2026-02-25T02:00:00.000Z"),
        command: "sleep 100",
      }),
    });

    const lock = readLock(home);
    expect(lock.pid).toBe(process.pid);
    expect(lock.startedAt).not.toBe("2026-02-25T01:00:00.000Z");
  });

  it("keeps hard failure when active daemon owns lock", async () => {
    const home = createTmpHome();
    homes.push(home);

    const startedAt = "2026-02-25T03:00:00.000Z";
    writeFileSync(
      join(home, "paseo.pid"),
      JSON.stringify({
        pid: 51_515,
        startedAt,
        hostname: "daemon-host",
        uid: 1,
        sockPath: "0.0.0.0:6767",
      } satisfies PidLockInfo)
    );

    await expect(
      acquirePidLock(home, "0.0.0.0:6767", {
        isPidRunning: () => true,
        getProcessMetadata: async () => ({
          startedAt: new Date("2026-02-25T03:00:01.000Z"),
          command: "bun run dev:server -- --no-relay --no-mcp",
        }),
      })
    ).rejects.toBeInstanceOf(PidLockError);

    const lock = readLock(home);
    expect(lock.pid).toBe(51_515);
    expect(lock.startedAt).toBe(startedAt);
  });
});
