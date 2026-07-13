import { describe, it, expect, vi } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function createMockBridge(overrides?: Partial<IPluginBridge>): IPluginBridge {
  return {
    sendAndWait: vi.fn<IPluginBridge["sendAndWait"]>().mockResolvedValue({
      id: "test",
      type: "result",
      success: true,
      result: [],
    }),
    getStatus: vi.fn<IPluginBridge["getStatus"]>().mockReturnValue({
      connected: true,
      fileKey: "mock-file",
      fileName: "Mock File",
      currentPage: "Page 1",
      port: 9500,
      connectedFiles: 1,
    }),
    listFiles: vi
      .fn<IPluginBridge["listFiles"]>()
      .mockReturnValue([{ fileKey: "mock-file", fileName: "Mock File", currentPage: "Page 1" }]),
    isConnected: vi.fn<IPluginBridge["isConnected"]>().mockReturnValue(true),
    ...overrides,
  };
}

async function setupClientServer(bridge: IPluginBridge) {
  const server = createPluginOSServer(bridge);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, clientTransport, serverTransport };
}

describe("execute_figma timeout transparency (F3)", () => {
  it("includes requestedTimeout in success payload", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({ id: "t", type: "result", success: true, result: 7 }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);
    const res = (await client.callTool({
      name: "execute_figma",
      arguments: { code: "return 7", timeout: 3000 },
    })) as ToolResult;
    expect(JSON.parse(res.content[0].text).requestedTimeout).toBe(3000);
    await clientTransport.close();
    await serverTransport.close();
  });

  it("names the requested timeout in failure text", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: false,
        error: "Execution timed out after 3000ms",
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);
    const res = (await client.callTool({
      name: "execute_figma",
      arguments: { code: "while(true){}", timeout: 3000 },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("(requestedTimeout: 3000ms)");
    await clientTransport.close();
    await serverTransport.close();
  });
});
