import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import type { IPluginBridge } from "@pluginos/shared";
import { UpgradeRouter } from "../../agent/upgrade-router.js";
import { AgentEndpoint } from "../../agent/daemon-endpoint.js";
import { connectDaemonLink, awaitDaemonHello } from "../daemon-link.js";

const PORT = 9713;

function mockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({ id: "t", type: "result", success: true, result: [] }),
    getStatus: vi.fn().mockReturnValue({
      connected: false,
      fileKey: null,
      fileName: null,
      currentPage: null,
      port: PORT,
      connectedFiles: 0,
      rest: null,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

describe("connectDaemonLink", () => {
  let httpServer: Server;
  let endpoint: AgentEndpoint;

  beforeEach(async () => {
    httpServer = createServer();
    const router = new UpgradeRouter(httpServer);
    endpoint = new AgentEndpoint(mockBridge(), "0.7.0");
    endpoint.register(router);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    await endpoint.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  it("handshakes, reports the daemon version, and serves MCP", async () => {
    const link = await connectDaemonLink(PORT, "0.7.0");
    expect(link.serverVersion).toBe("0.7.0");
    const tools = await link.client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("get_status");
    await link.close();
  });

  it("fires onClose when the daemon side drops the socket", async () => {
    const link = await connectDaemonLink(PORT, "0.7.0");
    const closed = new Promise<void>((r) => link.onClose(r));
    await endpoint.close();
    await closed; // resolves — no assertion needed beyond completion
  });

  it("rejects when nothing listens on the port", async () => {
    await expect(connectDaemonLink(9799, "0.7.0")).rejects.toThrow();
  });
});

describe("awaitDaemonHello", () => {
  // A raw TCP/WS peer reset doesn't reliably surface as a socket "error"
  // event in `ws` (it typically shows up as a plain close) — so this uses
  // an EventEmitter double to pin down the exact regression: a socket
  // "error" during the hello phase must reject immediately, not linger
  // until the handshake timeout.
  function fakeSocket(): WebSocket {
    const emitter = new EventEmitter() as unknown as WebSocket;
    emitter.close = vi.fn() as unknown as WebSocket["close"];
    return emitter;
  }

  it("rejects immediately when the socket errors during the hello phase, and cleans up its listeners", async () => {
    const socket = fakeSocket();
    const start = Date.now();
    const promise = awaitDaemonHello(socket, 2000);
    const expectation = expect(promise).rejects.toThrow("connection reset");
    socket.emit("error", new Error("connection reset"));
    await expectation;
    expect(Date.now() - start).toBeLessThan(1500);
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("error")).toBe(0);
  });
});
