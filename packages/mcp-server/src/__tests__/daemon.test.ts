import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemon, type DaemonHandle } from "../daemon.js";
import { probeStateEndpoint } from "../role.js";

const RANGE: [number, number] = [9720, 9722];

describe("runDaemon", () => {
  let dir: string;
  let handle: DaemonHandle | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-daemon-"));
  });
  afterEach(async () => {
    if (handle) await handle.close();
    handle = null;
    await rm(dir, { recursive: true, force: true });
  });

  it("binds, writes state.json with agent fields, and serves /state.json", async () => {
    const result = await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("attachInsteadPort");
    handle = result as DaemonHandle;

    const onDisk = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
    expect(onDisk.port).toBe(handle.port);
    expect(onDisk.agentProtocol).toBe(1);
    expect(onDisk.attachedAgents).toBe(0);
    expect(onDisk.serverVersion).toBe("0.7.0");

    const probed = await probeStateEndpoint(handle.port);
    expect(probed?.pid).toBe(process.pid);
  });

  it("returns attachInsteadPort when an equal-version daemon is already up", async () => {
    handle = (await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    })) as DaemonHandle;

    const second = await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    });
    expect(second).toEqual({ attachInsteadPort: handle.port });
  });

  it("updates state.json when the agent count changes", async () => {
    handle = (await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
      graceMs: 60_000,
      onExpire: () => {},
    })) as DaemonHandle;

    // Simulate an attach/detach through the endpoint's public counter hook.
    // (Full socket-level attach is covered by daemon-endpoint tests; here we
    // only verify the state.json plumbing.)
    const endpointAny = handle.agentEndpoint as unknown as {
      count: number;
      onChange: ((n: number) => void) | null;
    };
    endpointAny.count = 2;
    endpointAny.onChange?.(2);
    await new Promise((r) => setTimeout(r, 100));
    const onDisk = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
    expect(onDisk.attachedAgents).toBe(2);
    expect(onDisk.parentAlive).toBe(true);
  });
});
