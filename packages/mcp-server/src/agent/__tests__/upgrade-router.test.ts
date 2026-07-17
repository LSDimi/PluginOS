import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { UpgradeRouter, isAllowedOrigin, extractPathname } from "../upgrade-router.js";

const PORT = 9711;

describe("isAllowedOrigin", () => {
  it("allows missing, null, and figma origins; rejects others", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("null")).toBe(true);
    expect(isAllowedOrigin("https://www.figma.com")).toBe(true);
    expect(isAllowedOrigin("https://figma.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });
});

describe("extractPathname", () => {
  it("defaults to / when url is undefined", () => {
    expect(extractPathname(undefined)).toBe("/");
  });

  it("returns the path as-is when there's no query string", () => {
    expect(extractPathname("/agent")).toBe("/agent");
  });

  it("strips the query string", () => {
    expect(extractPathname("/agent?x=1")).toBe("/agent");
  });

  it("does not throw on malformed input that would break new URL()", () => {
    expect(extractPathname("%%invalid")).toBe("%%invalid");
  });

  it("does not throw on an absolute-form request target", () => {
    expect(extractPathname("http://[/")).toBe("http://[/");
  });
});

describe("UpgradeRouter", () => {
  let httpServer: Server;
  let router: UpgradeRouter;
  let wssRoot: WebSocketServer;
  let wssAgent: WebSocketServer;

  beforeEach(async () => {
    httpServer = createServer();
    router = new UpgradeRouter(httpServer);
    wssRoot = new WebSocketServer({ noServer: true });
    wssAgent = new WebSocketServer({ noServer: true });
    router.register("/", wssRoot);
    router.register("/agent", wssAgent);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    wssRoot.close();
    wssAgent.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  function connect(path: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}`);
      ws.on("open", () => {
        ws.close();
        resolve({ ok: true });
      });
      ws.on("error", () => resolve({ ok: false }));
    });
  }

  it("routes / and /agent to their respective servers", async () => {
    const rootConn = new Promise<string>((r) => wssRoot.on("connection", () => r("root")));
    const agentConn = new Promise<string>((r) => wssAgent.on("connection", () => r("agent")));

    expect((await connect("/")).ok).toBe(true);
    expect((await connect("/agent")).ok).toBe(true);
    expect(await rootConn).toBe("root");
    expect(await agentConn).toBe("agent");
  });

  it("rejects unknown paths", async () => {
    expect((await connect("/nope")).ok).toBe(false);
  });

  it("rejects disallowed origins", async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`, {
        headers: { origin: "https://evil.example.com" },
      });
      ws.on("open", () => {
        ws.close();
        resolve({ ok: true });
      });
      ws.on("error", () => resolve({ ok: false }));
    });
    expect(result.ok).toBe(false);
  });
});
