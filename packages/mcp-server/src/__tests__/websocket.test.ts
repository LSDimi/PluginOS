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

  it("accepts a WebSocket connection", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9551, 9551] });
    await server.start();

    const client = new WebSocket("ws://localhost:9551");
    await new Promise<void>((resolve) => client.on("open", resolve));
    expect(server.isConnected()).toBe(true);
    client.close();
  });

  it("sends a message and receives a response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9552, 9552] });
    await server.start();

    const client = new WebSocket("ws://localhost:9552");
    await new Promise<void>((resolve) => client.on("open", resolve));

    client.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      client.send(
        JSON.stringify({
          id: msg.id,
          type: "result",
          success: true,
          result: { echoed: true },
        })
      );
    });

    const result = await server.sendAndWait({
      id: "test_1",
      type: "run_operation",
      operation: "test",
      params: {},
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ echoed: true });
    client.close();
  });

  it("times out if no response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9553, 9553] });
    await server.start();

    const client = new WebSocket("ws://localhost:9553");
    await new Promise<void>((resolve) => client.on("open", resolve));

    await expect(
      server.sendAndWait(
        { id: "test_2", type: "execute", code: "return 1", timeout: 500 },
        500
      )
    ).rejects.toThrow(/timed out/i);
    client.close();
  });

  it("tracks file status from plugin", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9554, 9554] });
    await server.start();

    const client = new WebSocket("ws://localhost:9554");
    await new Promise<void>((resolve) => client.on("open", resolve));

    client.send(
      JSON.stringify({
        type: "status",
        fileKey: "abc123",
        fileName: "My Design",
        currentPage: "Page 1",
      })
    );

    // Give it a moment to process
    await new Promise((r) => setTimeout(r, 50));

    const status = server.getStatus();
    expect(status.connected).toBe(true);
    expect(status.fileKey).toBe("abc123");
    expect(status.fileName).toBe("My Design");
    client.close();
  });
});
