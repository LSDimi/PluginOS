import { describe, it, expect, vi } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";

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
});
