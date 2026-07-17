import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "index.ts");
const packageDir = join(__dirname, "..", "..");

describe("multi-session integration", () => {
  let dir: string;
  const clients: Client[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-multi-"));
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) {
      await c.close().catch(() => {});
    }
    await rm(dir, { recursive: true, force: true });
  });

  async function spawnSession(): Promise<Client> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", entry],
      cwd: packageDir,
      env: {
        ...process.env,
        PLUGINOS_STATE_DIR: dir,
        PLUGINOS_PORT_RANGE: "9730-9733",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "it", version: "1.0.0" });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  async function agentCount(client: Client): Promise<number> {
    const res = (await client.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
    };
    return JSON.parse(res.content[0].text).attachedAgents as number;
  }

  it("two sessions share one daemon; the second attaches instead of reaping", async () => {
    const a = await spawnSession();
    const toolsA = await a.listTools();
    expect(toolsA.tools.map((t) => t.name)).toContain("run_operation");
    expect(await agentCount(a)).toBe(1);

    const b = await spawnSession();
    const toolsB = await b.listTools();
    expect(toolsB.tools.length).toBe(toolsA.tools.length);
    expect(await agentCount(b)).toBe(2);

    // Session A must still be alive — the old behavior would have reaped it.
    expect(await agentCount(a)).toBe(2);
  }, 30_000);

  it("a surviving session promotes to daemon when the host session dies", async () => {
    const a = await spawnSession();
    await a.listTools();
    const b = await spawnSession();
    expect(await agentCount(b)).toBe(2);

    // Kill A (the daemon host). close() terminates the child process.
    await clients.splice(clients.indexOf(a), 1)[0].close();

    // B re-links (promotes) in the background; keep calling until it answers.
    let recovered = 0;
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      try {
        recovered = await agentCount(b);
        if (recovered === 1) break;
      } catch {
        // between daemons — expected transiently
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(recovered).toBe(1);
    const tools = await b.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("run_operation");
  }, 40_000);
});
