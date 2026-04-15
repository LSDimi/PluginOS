import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createHttpServer } from "../http-server.js";

function request(
  port: number,
  method: string,
  path: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("createHttpServer", () => {
  let server: http.Server;
  const PORT = 9570;
  const UI_CONTENT = "<html><body>PluginOS UI</body></html>";

  beforeAll(async () => {
    server = createHttpServer(() => UI_CONTENT);
    await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /ui returns HTML with correct content-type", async () => {
    const res = await request(PORT, "GET", "/ui");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toBe(UI_CONTENT);
  });

  it("GET /ui.html also returns HTML content", async () => {
    const res = await request(PORT, "GET", "/ui.html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toBe(UI_CONTENT);
  });

  it("GET /health returns JSON status ok", async () => {
    const res = await request(PORT, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });

  it("GET /unknown returns 404", async () => {
    const res = await request(PORT, "GET", "/unknown");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });

  it("OPTIONS returns 204 for CORS preflight", async () => {
    const res = await request(PORT, "OPTIONS", "/ui");
    expect(res.status).toBe(204);
    expect(res.body).toBe("");
  });

  it("sets CORS headers on all responses", async () => {
    const res = await request(PORT, "GET", "/health");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
  });

  it("calls getUiContent factory on each /ui request (dynamic content)", async () => {
    let callCount = 0;
    const dynamicServer = createHttpServer(() => {
      callCount++;
      return `<html>call-${callCount}</html>`;
    });
    const DPORT = 9571;
    await new Promise<void>((resolve) => dynamicServer.listen(DPORT, "127.0.0.1", resolve));

    const res1 = await request(DPORT, "GET", "/ui");
    const res2 = await request(DPORT, "GET", "/ui");
    expect(res1.body).toBe("<html>call-1</html>");
    expect(res2.body).toBe("<html>call-2</html>");
    expect(callCount).toBe(2);

    await new Promise<void>((resolve) => dynamicServer.close(() => resolve()));
  });
});
