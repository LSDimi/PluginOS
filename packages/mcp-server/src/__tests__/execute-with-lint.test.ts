import { describe, it, expect, vi } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function createMockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn<IPluginBridge["sendAndWait"]>().mockResolvedValue({
      id: "test",
      type: "result",
      success: true,
      result: { foo: "bar" },
    }),
    getStatus: vi.fn<IPluginBridge["getStatus"]>().mockReturnValue({
      connected: true,
      fileKey: "mock-file",
      fileName: "Mock File",
      currentPage: "Page 1",
      port: 9500,
      connectedFiles: 1,
      rest: "not_configured",
    }),
    listFiles: vi.fn<IPluginBridge["listFiles"]>().mockReturnValue([]),
    isConnected: vi.fn<IPluginBridge["isConnected"]>().mockReturnValue(true),
  };
}

async function setupClient(bridge: IPluginBridge) {
  const server = createPluginOSServer(bridge);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  return client;
}

describe("execute_figma with lint + prelude", () => {
  it("returns lint warnings alongside the result for a script using figma.notify", async () => {
    const bridge = createMockBridge();
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "execute_figma",
      arguments: { code: `figma.notify("hi"); return 1;` },
    })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.result).toEqual({ foo: "bar" });
    expect(Array.isArray(payload.lint)).toBe(true);
    expect(payload.lint.some((r: { ruleId: string }) => r.ruleId === "no-notify")).toBe(true);
    expect(typeof payload.preludeVersion).toBe("string");
    expect(typeof payload.durationMs).toBe("number");
  });

  it("sends the wrapped (prelude + user) script to the bridge", async () => {
    const bridge = createMockBridge();
    const client = await setupClient(bridge);
    await client.callTool({
      name: "execute_figma",
      arguments: { code: `return PluginOS.version;` },
    });
    const sendMock = bridge.sendAndWait as ReturnType<typeof vi.fn>;
    const [msg] = sendMock.mock.calls[0];
    expect(msg.type).toBe("execute");
    expect(msg.code).toContain("PluginOS");
    expect(msg.code).toContain("return PluginOS.version;");
  });

  it("returns empty lint array for clean scripts", async () => {
    const bridge = createMockBridge();
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "execute_figma",
      arguments: { code: `return figma.currentPage.name;` },
    })) as ToolResult;
    const payload = JSON.parse(res.content[0].text);
    expect(payload.lint).toEqual([]);
  });
});
