import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { runDaemon, type DaemonHandle } from "../daemon.js";
import { probeStateEndpoint } from "../role.js";
import { createAgentHello, parseAgentMessage } from "../agent/protocol.js";

/** Client-side /agent handshake, mirroring daemon-endpoint.test.ts. */
async function openAgentSocket(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const helloReply = new Promise<void>((resolve, reject) => {
    ws.once("message", (data) => {
      const msg = parseAgentMessage(data.toString());
      if (msg?.type === "DAEMON_HELLO") {
        resolve();
      } else {
        reject(new Error(`bad reply: ${String(data)}`));
      }
    });
  });
  ws.send(JSON.stringify(createAgentHello("0.8.0")));
  await helloReply;
  return ws;
}

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

  it("releases the lock and cleans up when no port is available", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(9723, "127.0.0.1", () => r()));
    try {
      await expect(
        runDaemon({
          stateDir: dir,
          portRange: [9723, 9723],
          version: "0.8.0",
          parentPid: process.ppid,
        })
      ).rejects.toThrow(/No available port/);
      // Lock must not be leaked.
      await expect(access(join(dir, "server.pid.lock"))).rejects.toThrow();
      // A fresh daemon on a free range must bind.
      handle = (await runDaemon({
        stateDir: dir,
        portRange: [9724, 9726],
        version: "0.8.0",
        parentPid: process.ppid,
      })) as DaemonHandle;
      expect(handle.port).toBe(9724);
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  });

  it("does not resurrect state.json when an agent is still attached at close", async () => {
    handle = (await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.8.0",
      parentPid: process.ppid,
      onExpire: () => {}, // a mis-armed grace timer must not exit the test process
    })) as DaemonHandle;

    const ws = await openAgentSocket(handle.port);
    await vi.waitFor(() => expect(handle!.agentEndpoint.getCount()).toBe(1));

    // Closing with the agent still attached fires the count-change callback
    // during teardown; a stale writeStateFile after clearSingletonState would
    // resurrect state.json.
    await handle.close();
    handle = null;
    await new Promise((r) => setTimeout(r, 150));
    await expect(access(join(dir, "state.json"))).rejects.toThrow();
    ws.close();
  });
});
