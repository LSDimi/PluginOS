import { describe, it, expect, vi } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function makeBridge(isConnected: () => boolean): IPluginBridge {
  return {
    sendAndWait: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      connected: isConnected(),
      fileKey: "mock-file",
      fileName: "Mock File",
      currentPage: "Page 1",
      port: 9500,
      connectedFiles: 1,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn(isConnected),
  } as unknown as IPluginBridge;
}

async function setupClient(bridge: IPluginBridge) {
  const server = createPluginOSServer(bridge);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  return client;
}

describe("wait_for_reconnect tool", () => {
  it("returns connected immediately when bridge is already connected", async () => {
    const bridge = makeBridge(() => true);
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 5 },
    })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(true);
    expect(payload.waitedMs).toBeLessThan(700);
  });

  it("returns timeout response when bridge never connects", async () => {
    const bridge = makeBridge(() => false);
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 2 },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(false);
    expect(payload.waitedMs).toBeGreaterThanOrEqual(2000);
  }, 5000);

  it("returns connected when bridge connects mid-wait", async () => {
    let connected = false;
    const bridge = makeBridge(() => connected);
    const client = await setupClient(bridge);
    setTimeout(() => {
      connected = true;
    }, 500);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 5 },
    })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(true);
    expect(payload.waitedMs).toBeGreaterThanOrEqual(500);
    expect(payload.waitedMs).toBeLessThan(1500);
  });
});
