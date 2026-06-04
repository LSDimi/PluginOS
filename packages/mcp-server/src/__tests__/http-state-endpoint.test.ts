import { describe, it, expect } from "vitest";
import { createHttpServer } from "../http-server.js";
import type { StateFile } from "../singleton/types.js";

describe("HTTP /state.json endpoint", () => {
  it("returns the current state object when set", async () => {
    const state: StateFile = {
      version: 1,
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 1700000000000,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
    };
    const server = createHttpServer(
      () => "<html></html>",
      () => state
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(state);
    } finally {
      server.close();
    }
  });

  it("returns 503 when no state is set", async () => {
    const server = createHttpServer(
      () => "<html></html>",
      () => null
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`);
      expect(res.status).toBe(503);
    } finally {
      server.close();
    }
  });
});
