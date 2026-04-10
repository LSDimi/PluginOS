import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { PluginOSWebSocketServer } from "../websocket.js";

describe("PluginOSWebSocketServer", () => {
  let server: PluginOSWebSocketServer;

  afterEach(async () => {
    if (server) await server.close();
  });

  it("starts on the specified port", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9550, 9550] });
    const port = await server.start();
    expect(port).toBe(9550);
  });

  it("accepts connections and tracks files", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9551, 9551] });
    await server.start();

    const client = new WebSocket("ws://localhost:9551");
    await new Promise<void>((r) => client.on("open", r));

    client.send(JSON.stringify({
      type: "status",
      fileKey: "file1",
      fileName: "Test File",
      currentPage: "Page 1",
    }));

    await new Promise((r) => setTimeout(r, 50));

    expect(server.isConnected("file1")).toBe(true);
    expect(server.listFiles()).toHaveLength(1);
    expect(server.getStatus().connectedFiles).toBe(1);

    client.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("tracks multiple files and sets active", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9552, 9552] });
    await server.start();

    const client1 = new WebSocket("ws://localhost:9552");
    await new Promise<void>((r) => client1.on("open", r));
    client1.send(JSON.stringify({ type: "status", fileKey: "file1", fileName: "File 1", currentPage: "P1" }));

    const client2 = new WebSocket("ws://localhost:9552");
    await new Promise<void>((r) => client2.on("open", r));
    client2.send(JSON.stringify({ type: "status", fileKey: "file2", fileName: "File 2", currentPage: "P1" }));

    await new Promise((r) => setTimeout(r, 50));

    expect(server.listFiles()).toHaveLength(2);
    expect(server.getActiveFileKey()).toBe("file2"); // Most recent
    expect(server.setActiveFile("file1")).toBe(true);
    expect(server.getActiveFileKey()).toBe("file1");

    client1.close();
    client2.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("sends message and receives response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9553, 9553] });
    await server.start();

    const client = new WebSocket("ws://localhost:9553");
    await new Promise<void>((r) => client.on("open", r));
    client.send(JSON.stringify({ type: "status", fileKey: "file1", fileName: "F1", currentPage: "P1" }));

    client.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "run_operation") {
        client.send(JSON.stringify({ id: msg.id, type: "result", success: true, result: 42 }));
      }
    });

    await new Promise((r) => setTimeout(r, 50));

    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("test_op", {});
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);

    client.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("times out if no response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9554, 9554] });
    await server.start();

    const client = new WebSocket("ws://localhost:9554");
    await new Promise<void>((r) => client.on("open", r));
    client.send(JSON.stringify({ type: "status", fileKey: "file1", fileName: "F1", currentPage: "P1" }));

    await new Promise((r) => setTimeout(r, 50));

    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("test_op", {});
    await expect(server.sendAndWait(msg, 500)).rejects.toThrow(/timed out/i);

    client.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("rejects when targeting non-existent file", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9555, 9555] });
    await server.start();

    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("test_op", {});
    await expect(server.sendAndWait(msg, 1000, "nonexistent")).rejects.toThrow(/not connected/i);
  });

  it("tracks file status from plugin", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9556, 9556] });
    await server.start();

    const client = new WebSocket("ws://localhost:9556");
    await new Promise<void>((resolve) => client.on("open", resolve));

    client.send(
      JSON.stringify({
        type: "status",
        fileKey: "abc123",
        fileName: "My Design",
        currentPage: "Page 1",
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    const status = server.getStatus();
    expect(status.connected).toBe(true);
    expect(status.fileKey).toBe("abc123");
    expect(status.fileName).toBe("My Design");
    client.close();
  });
});
