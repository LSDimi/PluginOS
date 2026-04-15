import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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

describe("createPluginOSServer DIP", () => {
  it("accepts IPluginBridge without knowing the concrete type", () => {
    const bridge = createMockBridge();
    const server = createPluginOSServer(bridge);
    expect(server).toBeDefined();
  });

  describe("round-trip through mock bridge", () => {
    let bridge: IPluginBridge;
    let client: Client;
    let clientTransport: InMemoryTransport;
    let serverTransport: InMemoryTransport;

    beforeAll(async () => {
      bridge = createMockBridge();
      const server = createPluginOSServer(bridge);

      [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      client = new Client({ name: "test-client", version: "1.0.0" });
      await client.connect(clientTransport);
    });

    afterAll(async () => {
      await clientTransport.close();
      await serverTransport.close();
    });

    it("get_status calls bridge.getStatus()", async () => {
      const result = await client.callTool({ name: "get_status", arguments: {} });

      expect(bridge.getStatus).toHaveBeenCalled();

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent).toHaveLength(1);

      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.connected).toBe(true);
      expect(parsed.fileKey).toBe("mock-file");
      expect(parsed.connectedFiles).toBe(1);
    });

    it("run_operation forwards to bridge.sendAndWait()", async () => {
      const result = await client.callTool({
        name: "run_operation",
        arguments: { name: "lint_styles", params: { scope: "page" } },
      });

      expect(bridge.sendAndWait).toHaveBeenCalled();

      const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
      const sentMessage = lastCall[0];
      expect(sentMessage.type).toBe("run_operation");
      expect((sentMessage as { operation: string }).operation).toBe("lint_styles");

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent).toHaveLength(1);
      expect(result.isError).toBeFalsy();
    });

    it("list_files calls bridge.listFiles()", async () => {
      const result = await client.callTool({ name: "list_files", arguments: {} });

      expect(bridge.listFiles).toHaveBeenCalled();

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.active_file).toBe("mock-file");
      expect(parsed.connected_files).toHaveLength(1);
      expect(parsed.total).toBe(1);
    });
  });
});
