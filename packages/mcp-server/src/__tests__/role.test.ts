import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideRole, probeStateEndpoint } from "../role.js";
import type { StateFile } from "../singleton/index.js";

function stateFixture(overrides: Partial<StateFile> = {}): StateFile {
  return {
    version: 1,
    pid: 4242,
    port: 9502,
    serverVersion: "0.7.0",
    startedAt: Date.now(),
    parentPid: 1,
    parentAlive: true,
    socketPath: null,
    agentProtocol: 1,
    attachedAgents: 1,
    ...overrides,
  };
}

describe("decideRole", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-role-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeState(state: StateFile): Promise<void> {
    await writeFile(join(dir, "state.json"), JSON.stringify(state));
  }

  it("binds when no state file exists", async () => {
    const decision = await decideRole({ stateDir: dir, myVersion: "0.7.0" });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("binds when the state file exists but the probe fails (stale daemon)", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => null,
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("attaches when the live daemon has the exact same version and protocol", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async (port) => stateFixture({ port }),
    });
    expect(decision).toEqual({ mode: "attach", port: 9502 });
  });

  it("binds on version mismatch (B1: exact equality only)", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.1",
      probe: async () => stateFixture(),
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("binds when the daemon predates the agent protocol (no agentProtocol field)", async () => {
    await writeState(stateFixture({ agentProtocol: undefined }));
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => stateFixture({ agentProtocol: undefined }),
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("trusts the probed state (HTTP) over the disk state for the port", async () => {
    await writeState(stateFixture({ port: 9502 }));
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => stateFixture({ port: 9503 }),
    });
    expect(decision).toEqual({ mode: "attach", port: 9503 });
  });
});

describe("probeStateEndpoint (real HTTP)", () => {
  let server: Server | null = null;
  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  });

  function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<void> {
    server = createServer(handler);
    return new Promise((r) => server!.listen(9714, "127.0.0.1", () => r()));
  }

  it("returns the state for a valid version-1 body", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          version: 1,
          pid: 1,
          port: 9714,
          serverVersion: "0.8.0",
          startedAt: 1,
          parentPid: 1,
          parentAlive: true,
          socketPath: null,
          agentProtocol: 1,
          attachedAgents: 0,
        })
      );
    });
    const state = await probeStateEndpoint(9714);
    expect(state?.serverVersion).toBe("0.8.0");
  });

  it("returns null for non-OK responses", async () => {
    await serve((_req, res) => {
      res.writeHead(503);
      res.end("no");
    });
    expect(await probeStateEndpoint(9714)).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    await serve((_req, res) => {
      res.writeHead(200);
      res.end("not json");
    });
    expect(await probeStateEndpoint(9714)).toBeNull();
  });

  it("returns null for a wrong schema version", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: 2 }));
    });
    expect(await probeStateEndpoint(9714)).toBeNull();
  });

  it("returns null when the response exceeds the timeout", async () => {
    await serve((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end("{}");
      }, 500);
    });
    expect(await probeStateEndpoint(9714, 100)).toBeNull();
  });

  it("returns null when nothing listens on the port", async () => {
    expect(await probeStateEndpoint(9715)).toBeNull();
  });
});
