import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSingletonLock, releaseSingletonLock } from "../index.js";

describe("acquireSingletonLock", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "pluginos-orch-test-"));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("acquires on a fresh dir with no prior server", async () => {
    const info = await acquireSingletonLock({ stateDir });
    expect(info.takeoverFromPid).toBeUndefined();
    expect(info.stateDir).toBe(stateDir);
    expect(info.pidFilePath).toBe(join(stateDir, "server.pid"));
    expect(info.stateFilePath).toBe(join(stateDir, "state.json"));
    expect(info.lockFilePath).toBe(join(stateDir, "server.pid.lock"));
  });

  it("reaps a stale PID and reports takeoverFromPid", async () => {
    await writeFile(join(stateDir, "server.pid"), "999999998");
    const info = await acquireSingletonLock({ stateDir });
    expect(info.takeoverFromPid).toBe(999999998);
  });

  it("creates the state dir if missing", async () => {
    const missingDir = join(stateDir, "nested", "pluginos");
    const info = await acquireSingletonLock({ stateDir: missingDir });
    expect(info.stateDir).toBe(missingDir);
  });

  it("returns a degraded info object when the state dir is not writable", async () => {
    const badDir = "/dev/null/not-a-dir";
    const info = await acquireSingletonLock({ stateDir: badDir });
    expect(info.stateDir).toBe(badDir);
  });
});

describe("acquireSingletonLock holdLock + recheckAttachable", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "pluginos-orch-test-"));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("returns attachInsteadPort and releases the lock when recheck finds a daemon", async () => {
    const info = await acquireSingletonLock({
      stateDir,
      recheckAttachable: async () => ({ port: 9503 }),
    });
    expect(info.attachInsteadPort).toBe(9503);
    // Lock must be released — a second acquisition succeeds immediately.
    const again = await acquireSingletonLock({ stateDir });
    expect(again.attachInsteadPort).toBeUndefined();
  });

  it("holds the lock until releaseSingletonLock when holdLock is set", async () => {
    const info = await acquireSingletonLock({ stateDir, holdLock: true });
    expect(info.holdingLock).toBe(true);
    await access(join(stateDir, "server.pid.lock")); // still present
    await releaseSingletonLock(info);
    await expect(access(join(stateDir, "server.pid.lock"))).rejects.toThrow();
  });
});
