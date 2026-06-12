import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocketPluginBridge } from "../WebSocketPluginBridge.js";

/**
 * Regression: when earlier ports in the range are occupied (e.g. zombie
 * pre-0.5.0 servers from still-running agent sessions), tryPort retries
 * listen() on the same httpServer. Each listen(port, cb) registers cb via
 * once("listening") — if the attempt fails with EADDRINUSE that callback
 * was never removed, so the eventual successful bind fired every stale
 * callback at once, constructing one WebSocketServer per failed attempt.
 * Multiple WSS instances on one httpServer each attach an "upgrade"
 * listener, and the first real client upgrade then crashes ws with
 * "handleUpgrade() was called more than once with the same socket".
 */
describe("WebSocketPluginBridge port retry", () => {
  let blocker: Server | null = null;
  let blocker2: Server | null = null;
  let bridge: WebSocketPluginBridge | null = null;
  let httpServer: Server | null = null;

  afterEach(async () => {
    try {
      await bridge?.close();
    } catch {
      /* ignore */
    }
    httpServer?.close();
    blocker?.close();
    blocker2?.close();
    blocker = null;
    blocker2 = null;
    bridge = null;
    httpServer = null;
  });

  it("attaches exactly one upgrade listener after retrying past occupied ports", async () => {
    blocker = createServer();
    blocker2 = createServer();
    await new Promise<void>((r) => blocker!.listen(9600, "127.0.0.1", r));
    await new Promise<void>((r) => blocker2!.listen(9601, "127.0.0.1", r));

    httpServer = createServer();
    bridge = new WebSocketPluginBridge({ httpServer, portRange: [9600, 9602] });
    const port = await bridge.start();

    expect(port).toBe(9602);
    expect(httpServer.listeners("upgrade")).toHaveLength(1);
  });

  it("attaches exactly one upgrade listener when the first port is free", async () => {
    httpServer = createServer();
    bridge = new WebSocketPluginBridge({ httpServer, portRange: [9610, 9612] });
    const port = await bridge.start();

    expect(port).toBe(9610);
    expect(httpServer.listeners("upgrade")).toHaveLength(1);
  });
});
