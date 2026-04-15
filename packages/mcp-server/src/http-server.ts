import { createServer, IncomingMessage, ServerResponse, Server } from "http";

export function createHttpServer(getUiContent: () => string): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS for Figma plugin iframe
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/ui" || req.url === "/ui.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getUiContent());
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return server;
}
