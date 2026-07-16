import { describe, it, expect, vi, afterEach } from "vitest";
import { figmaRest } from "../utils/restClient";

const stub = (status: number, body: unknown = {}) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  );

afterEach(() => vi.unstubAllGlobals());

describe("figmaRest error mapping", () => {
  it("returns data on 200 and sends the auth header", async () => {
    stub(200, { comments: [] });
    const r = await figmaRest("/v1/files/abc/comments", "figd_x");
    expect(r).toEqual({ ok: true, data: { comments: [] } });
    const call = vi.mocked(fetch).mock.calls[0] as any[];
    expect(call[0]).toBe("https://api.figma.com/v1/files/abc/comments");
    expect(call[1].headers["X-Figma-Token"]).toBe("figd_x");
  });
  it("401 → regenerate message", async () => {
    stub(401);
    const r = await figmaRest("/v1/files/abc/comments", "bad");
    expect(r).toEqual({
      ok: false,
      error: "PAT invalid or expired — regenerate and update it in the Setup tab",
    });
  });
  it("403 → scope message", async () => {
    stub(403);
    expect(((await figmaRest("/x", "t")) as any).error).toContain("required scope");
  });
  it("404 → access message", async () => {
    stub(404);
    expect(((await figmaRest("/x", "t")) as any).error).toContain("File not found");
  });
  it("429 → rate limit", async () => {
    stub(429);
    expect(((await figmaRest("/x", "t")) as any).error).toContain("Rate limited");
  });
  it("network failure → offline error naming the host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    expect(((await figmaRest("/x", "t")) as any).error).toContain("api.figma.com");
  });
});
