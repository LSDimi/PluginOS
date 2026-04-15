import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import net from "net";
import { WebSocketPluginBridge } from "../WebSocketPluginBridge.js";

describe("WebSocketPluginBridge edge cases", () => {
  let server: WebSocketPluginBridge;
  let blocker: net.Server | null = null;

  afterEach(async () => {
    if (server) await server.close();
    if (blocker) {
      await new Promise<void>((resolve) => blocker!.close(() => resolve()));
      blocker = null;
    }
  });

  // ─── Port auto-discovery ────────────────────────────────────────

  it("skips occupied port and binds to the next available one", async () => {
    // Block port 9540 with a raw TCP server
    blocker = net.createServer();
    await new Promise<void>((resolve) => blocker!.listen(9540, "127.0.0.1", resolve));

    server = new WebSocketPluginBridge({ portRange: [9540, 9542] });
    const port = await server.start();

    expect(port).toBe(9541);
  });

  it("throws when no port is available in range", async () => {
    // Block both ports
    blocker = net.createServer();
    await new Promise<void>((resolve) => blocker!.listen(9543, "127.0.0.1", resolve));

    const blocker2 = net.createServer();
    await new Promise<void>((resolve) => blocker2.listen(9544, "127.0.0.1", resolve));

    server = new WebSocketPluginBridge({ portRange: [9543, 9544] });
    await expect(server.start()).rejects.toThrow(/No available port/);

    await new Promise<void>((resolve) => blocker2.close(() => resolve()));
  });

  // ─── close() behavior ──────────────────────────────────────────

  it("close() rejects all pending requests with 'Server closing'", async () => {
    server = new WebSocketPluginBridge({ portRange: [9545, 9545] });
    await server.start();

    const client = new WebSocket("ws://localhost:9545");
    await new Promise<void>((r) => client.on("open", r));
    client.send(
      JSON.stringify({ type: "status", fileKey: "f1", fileName: "F1", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    // Send a request that won't be answered
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("slow_op", {});
    const resultPromise = server.sendAndWait(msg, 10000);

    // Attach rejection handler BEFORE close triggers it (avoids unhandled rejection)
    const expectation = expect(resultPromise).rejects.toThrow(/Server closing/);

    // Close the server while request is pending
    await server.close();
    await expectation;
    client.close();
  });

  // ─── Active file fallback on disconnect ────────────────────────

  it("falls back to most recently active file when active file disconnects", async () => {
    server = new WebSocketPluginBridge({ portRange: [9546, 9546] });
    await server.start();

    // Connect file1 first
    const client1 = new WebSocket("ws://localhost:9546");
    await new Promise<void>((r) => client1.on("open", r));
    client1.send(
      JSON.stringify({ type: "status", fileKey: "file1", fileName: "File 1", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    // Connect file2 — becomes active (most recent)
    const client2 = new WebSocket("ws://localhost:9546");
    await new Promise<void>((r) => client2.on("open", r));
    client2.send(
      JSON.stringify({ type: "status", fileKey: "file2", fileName: "File 2", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(server.getActiveFileKey()).toBe("file2");

    // Disconnect active file (file2)
    client2.close();
    await new Promise((r) => setTimeout(r, 100));

    // Should fall back to file1
    expect(server.getActiveFileKey()).toBe("file1");
    expect(server.isConnected("file1")).toBe(true);
    expect(server.isConnected("file2")).toBe(false);

    client1.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("sets activeFileKey to null when last file disconnects", async () => {
    server = new WebSocketPluginBridge({ portRange: [9547, 9547] });
    await server.start();

    const client = new WebSocket("ws://localhost:9547");
    await new Promise<void>((r) => client.on("open", r));
    client.send(
      JSON.stringify({ type: "status", fileKey: "solo", fileName: "Solo", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(server.getActiveFileKey()).toBe("solo");

    client.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(server.getActiveFileKey()).toBeNull();
    expect(server.isConnected()).toBe(false);
  });

  // ─── sendAndWait edge cases ────────────────────────────────────

  it("rejects with descriptive message when no plugin is connected at all", async () => {
    server = new WebSocketPluginBridge({ portRange: [9548, 9548] });
    await server.start();

    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("test_op", {});

    await expect(server.sendAndWait(msg)).rejects.toThrow(
      /No plugin connected.*Open PluginOS Bridge/
    );
  });

  it("rejects with file-specific message for non-existent fileKey", async () => {
    server = new WebSocketPluginBridge({ portRange: [9549, 9549] });
    await server.start();

    // Connect one file so there IS a connection, but target a different one
    const client = new WebSocket("ws://localhost:9549");
    await new Promise<void>((r) => client.on("open", r));
    client.send(
      JSON.stringify({ type: "status", fileKey: "real", fileName: "Real", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("test_op", {});

    await expect(server.sendAndWait(msg, 1000, "ghost")).rejects.toThrow(/"ghost" not connected/);

    client.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  // ─── Malformed messages ────────────────────────────────────────

  it("ignores malformed JSON from plugin without crashing", async () => {
    server = new WebSocketPluginBridge({ portRange: [9539, 9539] });
    await server.start();

    const client = new WebSocket("ws://localhost:9539");
    await new Promise<void>((r) => client.on("open", r));

    // Send garbage
    client.send("not valid json{{{");
    client.send("another garbage");
    await new Promise((r) => setTimeout(r, 50));

    // Server should still be functioning — send valid status
    client.send(
      JSON.stringify({ type: "status", fileKey: "ok", fileName: "OK", currentPage: "P1" })
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(server.isConnected("ok")).toBe(true);
    expect(server.getStatus().connected).toBe(true);

    client.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  // ─── setActiveFile ─────────────────────────────────────────────

  it("setActiveFile returns false for unknown fileKey", async () => {
    server = new WebSocketPluginBridge({ portRange: [9538, 9538] });
    await server.start();

    expect(server.setActiveFile("nonexistent")).toBe(false);
  });

  // ─── getStatus when disconnected ───────────────────────────────

  it("returns disconnected status when no files are connected", async () => {
    server = new WebSocketPluginBridge({ portRange: [9537, 9537] });
    await server.start();

    const status = server.getStatus();
    expect(status.connected).toBe(false);
    expect(status.fileKey).toBeNull();
    expect(status.fileName).toBeNull();
    expect(status.currentPage).toBeNull();
    expect(status.connectedFiles).toBe(0);
    expect(status.port).toBe(9537);
  });
});
