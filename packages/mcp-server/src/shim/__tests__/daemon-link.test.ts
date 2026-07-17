import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { IPluginBridge } from "@pluginos/shared";
import { UpgradeRouter } from "../../agent/upgrade-router.js";
import { AgentEndpoint } from "../../agent/daemon-endpoint.js";
import { connectDaemonLink } from "../daemon-link.js";

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
