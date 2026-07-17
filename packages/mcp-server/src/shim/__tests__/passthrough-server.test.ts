import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPluginOSServer } from "../../server.js";
import { createShimServer } from "../passthrough-server.js";
import type { IPluginBridge } from "@pluginos/shared";

function mockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({
      id: "t",
      type: "result",
      success: true,
      result: [{ name: "lint_styles", description: "Lint", category: "lint" }],
    }),
    getStatus: vi.fn().mockReturnValue({
      connected: true,
      fileKey: "f",
      fileName: "F",
      currentPage: "P",
      port: 9500,
      connectedFiles: 1,
      rest: null,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

/** Wire a real PluginOS server as the "daemon" behind an in-memory link. */
async function daemonClient(): Promise<Client> {
  const daemon = createPluginOSServer(mockBridge(), { getAgentCount: () => 1 });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await daemon.connect(st);
  const client = new Client({ name: "link", version: "0.7.0" });
  await client.connect(ct);
  return client;
}

async function shimFacingClient(waitForLink: () => Promise<Client | null>) {
  const shim = createShimServer(waitForLink, "0.7.0");
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await shim.connect(st);
  const front = new Client({ name: "claude", version: "1.0.0" });
  await front.connect(ct);
  return front;
}

describe("createShimServer", () => {
  it("forwards tools/list to the daemon", async () => {
    const link = await daemonClient();
    const front = await shimFacingClient(async () => link);
    const tools = await front.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("run_operation");
    expect(tools.tools.map((t) => t.name)).toContain("wait_for_reconnect");
  });

  it("forwards tools/call results verbatim, including isError", async () => {
    const link = await daemonClient();
    const front = await shimFacingClient(async () => link);
    const ok = (await front.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(ok.content[0].text).attachedAgents).toBe(1);
  });

  it("returns an isError result (not a protocol error) when no link arrives", async () => {
    const front = await shimFacingClient(async () => null);
    const result = (await front.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("daemon");
  });

  it("returns an isError result (not a protocol error) when the link dies mid-call", async () => {
    const badLink = {
      callTool: () => Promise.reject(new Error("Connection closed")),
    } as unknown as Client;
    const front = await shimFacingClient(async () => badLink);
    // Must RESOLVE with an isError result — a rejection here would mean the
    // shim surfaced a JSON-RPC protocol error instead of absorbing the churn.
    const result = (await front.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("daemon");
    expect(result.content[0].text).toContain("Connection closed");
  });
});
