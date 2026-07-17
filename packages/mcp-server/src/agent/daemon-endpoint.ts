import { WebSocketServer, type WebSocket } from "ws";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { WsJsonRpcTransport } from "./ws-json-rpc-transport.js";
import type { UpgradeRouter } from "./upgrade-router.js";
import {
  AGENT_PATH,
  AGENT_PROTOCOL_VERSION,
  HANDSHAKE_TIMEOUT_MS,
  createDaemonHello,
  parseAgentMessage,
} from "./protocol.js";

/**
 * Daemon side of /agent: one McpServer instance per attached shim, all
 * sharing the single plugin bridge. Bridge request IDs are minted in this
 * process, so cross-session pending-request collisions are impossible.
 */
export class AgentEndpoint {
  private wss = new WebSocketServer({ noServer: true });
  private count = 0;
  private onChange: ((n: number) => void) | null = null;
  private sockets = new Set<WebSocket>();

  constructor(
    private bridge: IPluginBridge,
    private serverVersion: string
  ) {
    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
  }

  register(router: UpgradeRouter): void {
    router.register(AGENT_PATH, this.wss);
  }

  getCount(): number {
    return this.count;
  }

  onCountChange(cb: (n: number) => void): void {
    this.onChange = cb;
  }

  private handleConnection(ws: WebSocket): void {
    const timer = setTimeout(() => ws.close(), HANDSHAKE_TIMEOUT_MS);
    ws.once("close", () => clearTimeout(timer));
    ws.once("message", (data: Buffer | string) => {
      clearTimeout(timer);
      const msg = parseAgentMessage(data.toString());
      if (msg?.type !== "AGENT_HELLO" || msg.agentProtocol !== AGENT_PROTOCOL_VERSION) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify(createDaemonHello(this.serverVersion)));
      // MUST stay synchronous from here through transport.start(): the
      // shim sends `initialize` as soon as it sees DAEMON_HELLO, and the
      // mcp-frame listener has to be attached before yielding to I/O.
      this.attachAgent(ws);
    });
  }

  private attachAgent(ws: WebSocket): void {
    const server = createPluginOSServer(this.bridge, { getAgentCount: () => this.count });
    const transport = new WsJsonRpcTransport(ws);
    this.sockets.add(ws);
    this.count += 1;
    this.onChange?.(this.count);
    ws.on("close", () => {
      this.sockets.delete(ws);
      this.count -= 1;
      this.onChange?.(this.count);
      void server.close();
    });
    // Protocol.connect() reaches transport.start() synchronously.
    void server.connect(transport).catch(() => ws.close());
  }

  async close(): Promise<void> {
    // terminate() (not close()): covers pre-handshake sockets and guarantees wss.close() drains promptly
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
