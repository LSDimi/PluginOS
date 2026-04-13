import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { WebSocketPluginBridge } from "../WebSocketPluginBridge";

describe("MCP Server ↔ Plugin integration", () => {
  let server: WebSocketPluginBridge;
  let mockPlugin: WebSocket;

  beforeAll(async () => {
    server = new WebSocketPluginBridge({ portRange: [9560, 9560] });
    await server.start();

    mockPlugin = new WebSocket("ws://localhost:9560");
    await new Promise<void>((resolve) => mockPlugin.on("open", resolve));

    // Simulate plugin sending status
    mockPlugin.send(
      JSON.stringify({
        type: "status",
        fileKey: "test123",
        fileName: "Test File",
        currentPage: "Page 1",
      })
    );

    // Mock plugin: respond to operations
    mockPlugin.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "run_operation" && msg.operation === "__list_operations") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: [
              { name: "lint_styles", description: "Lint styles", category: "lint" },
              { name: "check_contrast", description: "Check contrast", category: "accessibility" },
            ],
          })
        );
      } else if (msg.type === "run_operation") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: { summary: `Executed ${msg.operation}`, params: msg.params },
          })
        );
      } else if (msg.type === "execute") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: 42,
          })
        );
      }
    });

    // Wait for status to be processed
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    mockPlugin.close();
    await server.close();
  });

  it("reports connected status with file info", () => {
    const status = server.getStatus();
    expect(status.connected).toBe(true);
    expect(status.fileKey).toBe("test123");
    expect(status.fileName).toBe("Test File");
  });

  it("sends run_operation and receives result", async () => {
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("lint_styles", { scope: "page" });
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("summary");
  });

  it("sends execute and receives result", async () => {
    const { createExecuteMessage } = await import("@pluginos/shared");
    const msg = createExecuteMessage("return 42");
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("lists operations via __list_operations", async () => {
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("__list_operations", {});
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.result)).toBe(true);
  });

  it("targets specific file by fileKey", async () => {
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("lint_styles", { scope: "page" });
    const result = await server.sendAndWait(msg, 5000, "test123");
    expect(result.success).toBe(true);
  });

  it("lists connected files", () => {
    const files = server.listFiles();
    expect(files).toHaveLength(1);
    expect(files[0].fileKey).toBe("test123");
    expect(files[0].fileName).toBe("Test File");
  });

  it("reports connectedFiles count in status", () => {
    const status = server.getStatus();
    expect(status.connectedFiles).toBe(1);
  });
});
