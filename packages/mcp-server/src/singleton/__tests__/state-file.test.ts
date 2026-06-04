import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStateFile, writeStateFile, readStateFile, removeStateFile } from "../state-file.js";
import type { StateFile } from "../types.js";

describe("state-file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-state-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("builds a state object with required fields", () => {
    const state = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    expect(state.version).toBe(1);
    expect(state.pid).toBe(1234);
    expect(state.port).toBe(9500);
    expect(state.serverVersion).toBe("0.4.3");
    expect(state.parentPid).toBe(99);
    expect(state.parentAlive).toBe(true);
    expect(state.socketPath).toBeNull();
    expect(typeof state.startedAt).toBe("number");
  });

  it("writes atomically (tmp + rename) and reads back", async () => {
    const path = join(dir, "state.json");
    const state: StateFile = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    await writeStateFile(path, state);
    const read = await readStateFile(path);
    expect(read).toEqual(state);
  });

  it("reads return null for missing files", async () => {
    expect(await readStateFile(join(dir, "missing.json"))).toBeNull();
  });

  it("reads return null for malformed files", async () => {
    const path = join(dir, "malformed.json");
    await writeFile(path, "not-json");
    expect(await readStateFile(path)).toBeNull();
  });

  it("reads return null for state with wrong version", async () => {
    const path = join(dir, "future.json");
    await writeFile(path, JSON.stringify({ version: 999, pid: 1, port: 9500 }));
    expect(await readStateFile(path)).toBeNull();
  });

  it("removes the file", async () => {
    const path = join(dir, "state.json");
    const state = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    await writeStateFile(path, state);
    await removeStateFile(path);
    expect(await readStateFile(path)).toBeNull();
  });
});
