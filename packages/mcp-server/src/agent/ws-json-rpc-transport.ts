import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { WebSocket } from "ws";
import { createMcpFrame, parseAgentMessage } from "./protocol.js";

/**
 * MCP Transport over a ws socket carrying {type:"mcp",payload} frames.
 * Symmetric: used by the daemon (server-accepted socket) and the shim
 * (client socket). The attach handshake happens BEFORE this transport is
 * constructed — non-mcp frames arriving afterwards are ignored.
 */
export class WsJsonRpcTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private closed = false;

  constructor(private socket: WebSocket) {}

  private fireClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  async start(): Promise<void> {
    this.socket.on("message", (data: Buffer | string) => {
      const msg = parseAgentMessage(data.toString());
      if (msg?.type === "mcp") {
        this.onmessage?.(msg.payload as JSONRPCMessage);
      }
    });
    this.socket.on("close", () => this.fireClose());
    this.socket.on("error", (err: Error) => this.onerror?.(err));
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.socket.send(JSON.stringify(createMcpFrame(message)));
  }

  async close(): Promise<void> {
    try {
      this.socket.close();
    } catch {
      // socket may already be closed
    }
    this.fireClose();
  }
}
