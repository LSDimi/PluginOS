import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import WebSocket from "ws";
import type { IPluginBridge } from "@pluginos/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UpgradeRouter } from "../upgrade-router.js";
import { AgentEndpoint } from "../daemon-endpoint.js";
import { WsJsonRpcTransport } from "../ws-json-rpc-transport.js";
import { createAgentHello, parseAgentMessage } from "../protocol.js";

const PORT = 9712;

function createMockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({ id: "t", type: "result", success: true, result: [] }),
    getStatus: vi.fn().mockReturnValue({
      connected: false,
      fileKey: null,
      fileName: null,
      currentPage: null,
      port: PORT,
      connectedFiles: 0,
      rest: "not_configured",
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

/** Client-side handshake helper mirroring what daemon-link does (Task 9). */
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
  ws.send(JSON.stringify(createAgentHello("0.7.0")));
  await helloReply;
  return ws;
}

describe("AgentEndpoint", () => {
  let httpServer: Server;
  let endpoint: AgentEndpoint;

  beforeEach(async () => {
    httpServer = createServer();
    const router = new UpgradeRouter(httpServer);
    endpoint = new AgentEndpoint(createMockBridge(), "0.7.0");
    endpoint.register(router);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    await endpoint.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  it("serves MCP to an attached agent and tracks the count", async () => {
    const counts: number[] = [];
    endpoint.onCountChange((n) => counts.push(n));

    const ws = await openAgentSocket(PORT);
    const client = new Client({ name: "test-shim", version: "0.7.0" });
    await client.connect(new WsJsonRpcTransport(ws));

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("get_status");
    expect(names).toContain("run_operation");
    expect(endpoint.getCount()).toBe(1);

    const status = await client.callTool({ name: "get_status", arguments: {} });
    const parsed = JSON.parse((status as { content: Array<{ text: string }> }).content[0].text);
    expect(parsed.attachedAgents).toBe(1);

    await client.close();
    await vi.waitFor(() => expect(endpoint.getCount()).toBe(0));
    expect(counts).toEqual([1, 0]);
  });

  it("supports two concurrent agents with independent MCP sessions", async () => {
    const wsA = await openAgentSocket(PORT);
    const wsB = await openAgentSocket(PORT);
    const a = new Client({ name: "shim-a", version: "0.7.0" });
    const b = new Client({ name: "shim-b", version: "0.7.0" });
    await a.connect(new WsJsonRpcTransport(wsA));
    await b.connect(new WsJsonRpcTransport(wsB));

    const [ta, tb] = await Promise.all([a.listTools(), b.listTools()]);
    expect(ta.tools.length).toBeGreaterThan(0);
    expect(tb.tools.length).toBe(ta.tools.length);
    expect(endpoint.getCount()).toBe(2);

    await a.close();
    await vi.waitFor(() => expect(endpoint.getCount()).toBe(1));
    const again = await b.listTools(); // B unaffected by A's departure
    expect(again.tools.length).toBe(tb.tools.length);
    await b.close();
  });

  it("closes sockets that send a wrong protocol version", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`);
    await new Promise<void>((r) => ws.once("open", () => r()));
    ws.send(JSON.stringify({ type: "AGENT_HELLO", agentProtocol: 99, shimVersion: "9.9.9" }));
    await new Promise<void>((r) => ws.once("close", () => r()));
    expect(endpoint.getCount()).toBe(0);
  });

  it("closes sockets that never send a hello", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`);
    await new Promise<void>((r) => ws.once("open", () => r()));
    await new Promise<void>((r) => ws.once("close", () => r())); // handshake timeout
    expect(endpoint.getCount()).toBe(0);
  }, 5000);

  it("close() does not stall on a pre-handshake socket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`);
    await new Promise<void>((r) => ws.once("open", () => r()));
    // No hello sent — socket is pre-handshake, tracked only in wss.clients.
    const t0 = Date.now();
    await endpoint.close();
    expect(Date.now() - t0).toBeLessThan(1000);
  }, 5000);
});
