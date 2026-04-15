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

// ─── list_operations ────────────────────────────────────────────────

describe("list_operations tool", () => {
  it("returns operations on success", async () => {
    const ops = [
      { name: "lint_styles", description: "Lint styles", category: "lint" },
      { name: "check_contrast", description: "Check contrast", category: "accessibility" },
    ];
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: true,
        result: ops,
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "list_operations",
      arguments: {},
    })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(ops);
    expect(result.isError).toBeFalsy();

    await clientTransport.close();
    await serverTransport.close();
  });

  it("passes category filter to bridge", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({ name: "list_operations", arguments: { category: "lint" } });

    const sentMsg = vi.mocked(bridge.sendAndWait).mock.lastCall![0];
    expect(sentMsg.type).toBe("run_operation");
    expect((sentMsg as any).params.category).toBe("lint");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error when bridge reports failure", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: false,
        error: "Plugin crashed",
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "list_operations",
      arguments: {},
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Plugin crashed");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error when bridge throws", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockRejectedValue(new Error("No plugin connected")),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "list_operations",
      arguments: {},
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No plugin connected");

    await clientTransport.close();
    await serverTransport.close();
  });
});

// ─── run_operation ──────────────────────────────────────────────────

describe("run_operation tool", () => {
  it("forwards operation name and params to bridge", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles", params: { scope: "page" } },
    });

    const sentMsg = vi.mocked(bridge.sendAndWait).mock.lastCall![0];
    expect(sentMsg.type).toBe("run_operation");
    expect((sentMsg as any).operation).toBe("lint_styles");
    expect((sentMsg as any).params).toEqual({ scope: "page" });

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns structured result on success", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: true,
        result: { count: 3, issues: [] },
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles" },
    })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(3);
    expect(result.isError).toBeFalsy();

    await clientTransport.close();
    await serverTransport.close();
  });

  it("passes file_key to bridge.sendAndWait", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles", file_key: "file-abc" },
    });

    const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
    expect(lastCall[2]).toBe("file-abc"); // third argument = fileKey

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error with operation name when bridge reports failure", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: false,
        error: "Node not found",
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("lint_styles");
    expect(result.content[0].text).toContain("Node not found");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error when bridge throws (e.g. timeout)", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockRejectedValue(new Error("Operation timed out after 30000ms")),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("uses 30000ms timeout for bridge.sendAndWait", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "run_operation",
      arguments: { name: "lint_styles" },
    });

    const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
    expect(lastCall[1]).toBe(30000); // second argument = timeout

    await clientTransport.close();
    await serverTransport.close();
  });
});

// ─── execute_figma ──────────────────────────────────────────────────

describe("execute_figma tool", () => {
  it("returns execution result on success", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: true,
        result: { nodeCount: 42 },
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "execute_figma",
      arguments: { code: "return figma.currentPage.children.length" },
    })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodeCount).toBe(42);
    expect(result.isError).toBeFalsy();

    await clientTransport.close();
    await serverTransport.close();
  });

  it("caps timeout at 30000ms", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "execute_figma",
      arguments: { code: "return 1", timeout: 99999 },
    });

    const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
    // safeTimeout = Math.min(99999, 30000) = 30000
    // bridge.sendAndWait called with safeTimeout + 2000 = 32000
    expect(lastCall[1]).toBe(32000);

    // Also verify the execute message itself has capped timeout
    const sentMsg = lastCall[0];
    expect(sentMsg.type).toBe("execute");
    expect((sentMsg as any).timeout).toBe(30000);

    await clientTransport.close();
    await serverTransport.close();
  });

  it("uses default timeout of 5000ms when not specified", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "execute_figma",
      arguments: { code: "return 1" },
    });

    const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
    // default timeout = 5000, sendAndWait gets 5000 + 2000 = 7000
    expect(lastCall[1]).toBe(7000);

    await clientTransport.close();
    await serverTransport.close();
  });

  it("passes file_key to bridge", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    await client.callTool({
      name: "execute_figma",
      arguments: { code: "return 1", file_key: "target-file" },
    });

    const lastCall = vi.mocked(bridge.sendAndWait).mock.lastCall!;
    expect(lastCall[2]).toBe("target-file");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error when execution fails", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockResolvedValue({
        id: "t",
        type: "result",
        success: false,
        error: "ReferenceError: x is not defined",
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "execute_figma",
      arguments: { code: "return x" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Execution failed");
    expect(result.content[0].text).toContain("ReferenceError");

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns error when bridge throws", async () => {
    const bridge = createMockBridge({
      sendAndWait: vi.fn().mockRejectedValue(new Error("Plugin disconnected")),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({
      name: "execute_figma",
      arguments: { code: "return 1" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Plugin disconnected");

    await clientTransport.close();
    await serverTransport.close();
  });
});

// ─── get_status ─────────────────────────────────────────────────────

describe("get_status tool", () => {
  it("returns connected status with file info", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({ name: "get_status", arguments: {} })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.connected).toBe(true);
    expect(parsed.fileKey).toBe("mock-file");
    expect(parsed.fileName).toBe("Mock File");
    expect(parsed.connectedFiles).toBe(1);
    expect(result.isError).toBeFalsy();

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns disconnected status when no files connected", async () => {
    const bridge = createMockBridge({
      getStatus: vi.fn().mockReturnValue({
        connected: false,
        fileKey: null,
        fileName: null,
        currentPage: null,
        port: 9500,
        connectedFiles: 0,
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({ name: "get_status", arguments: {} })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.connected).toBe(false);
    expect(parsed.fileKey).toBeNull();
    expect(parsed.connectedFiles).toBe(0);

    await clientTransport.close();
    await serverTransport.close();
  });
});

// ─── list_files ─────────────────────────────────────────────────────

describe("list_files tool", () => {
  it("returns file list with active file and count", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({ name: "list_files", arguments: {} })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.active_file).toBe("mock-file");
    expect(parsed.connected_files).toHaveLength(1);
    expect(parsed.total).toBe(1);

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns empty list when no files connected", async () => {
    const bridge = createMockBridge({
      listFiles: vi.fn().mockReturnValue([]),
      getStatus: vi.fn().mockReturnValue({
        connected: false,
        fileKey: null,
        fileName: null,
        currentPage: null,
        port: 9500,
        connectedFiles: 0,
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({ name: "list_files", arguments: {} })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.active_file).toBeNull();
    expect(parsed.connected_files).toHaveLength(0);
    expect(parsed.total).toBe(0);

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns multiple files with correct total", async () => {
    const files = [
      { fileKey: "file-a", fileName: "File A", currentPage: "Page 1" },
      { fileKey: "file-b", fileName: "File B", currentPage: "Page 2" },
      { fileKey: "file-c", fileName: "File C", currentPage: "Page 1" },
    ];
    const bridge = createMockBridge({
      listFiles: vi.fn().mockReturnValue(files),
      getStatus: vi.fn().mockReturnValue({
        connected: true,
        fileKey: "file-b",
        fileName: "File B",
        currentPage: "Page 2",
        port: 9500,
        connectedFiles: 3,
      }),
    });
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);

    const result = (await client.callTool({ name: "list_files", arguments: {} })) as ToolResult;
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.active_file).toBe("file-b");
    expect(parsed.connected_files).toHaveLength(3);
    expect(parsed.total).toBe(3);

    await clientTransport.close();
    await serverTransport.close();
  });
});
