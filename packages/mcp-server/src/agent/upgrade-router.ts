import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocketServer } from "ws";

/** Same allowlist the bridge used in its verifyClient callback. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return (
    !origin ||
    origin === "null" ||
    origin.startsWith("https://www.figma.com") ||
    origin.startsWith("https://figma.com")
  );
}

/**
 * Owns the single 'upgrade' listener on the HTTP server and routes
 * connections by pathname to registered WebSocketServers (noServer mode).
 * Two WebSocketServers constructed with {server} would each try to handle
 * every upgrade — this router is the only safe way to host both the plugin
 * socket ("/") and the agent socket ("/agent") on one port.
 */
export class UpgradeRouter {
  private routes = new Map<string, WebSocketServer>();

  constructor(httpServer: Server) {
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const wss = this.routes.get(pathname);
      if (!wss || !isAllowedOrigin(req.headers.origin)) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
  }

  register(path: string, wss: WebSocketServer): void {
    this.routes.set(path, wss);
  }
}
