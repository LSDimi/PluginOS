import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../lockfile.js";

describe("lockfile primitive", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-lock-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("acquires a lock on a fresh path", async () => {
    const lockPath = join(dir, "server.pid.lock");
    const result = await acquireLock(lockPath);
    expect(result.acquired).toBe(true);
    expect(result.oldPid).toBeNull();
  });

  it("fails to acquire when held by a live PID", async () => {
    const lockPath = join(dir, "server.pid.lock");
    await acquireLock(lockPath);
    const result = await acquireLock(lockPath, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.acquired).toBe(false);
    expect(result.oldPid).toBe(process.pid);
  });

  it("releases the lock", async () => {
    const lockPath = join(dir, "server.pid.lock");
    await acquireLock(lockPath);
    await releaseLock(lockPath);
    const result = await acquireLock(lockPath);
    expect(result.acquired).toBe(true);
  });

  it("treats a lockfile with a dead PID as stale and takes over", async () => {
    const lockPath = join(dir, "server.pid.lock");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(lockPath, "999999999");
    const result = await acquireLock(lockPath, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.acquired).toBe(true);
    expect(result.oldPid).toBe(999999999);
  });
});
