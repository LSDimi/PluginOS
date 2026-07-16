import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideRole } from "../role.js";
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
