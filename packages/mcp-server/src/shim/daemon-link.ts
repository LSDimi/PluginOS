import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WsJsonRpcTransport } from "../agent/ws-json-rpc-transport.js";
import {
  AGENT_PATH,
  HANDSHAKE_TIMEOUT_MS,
  createAgentHello,
  parseAgentMessage,
} from "../agent/protocol.js";
import type { DaemonHello } from "../agent/protocol.js";

export interface DaemonLink {
  client: Client;
  serverVersion: string;
  onClose(cb: () => void): void;
  close(): Promise<void>;
}

function awaitOpen(socket: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("agent socket open timeout"));
    }, timeoutMs);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function awaitDaemonHello(socket: WebSocket, timeoutMs: number): Promise<DaemonHello> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("DAEMON_HELLO timeout"));
    }, timeoutMs);
    // once(): the hello listener must be consumed before the transport
    // attaches its own message listener.
    socket.once("message", (data: Buffer | string) => {
      clearTimeout(timer);
      const msg = parseAgentMessage(data.toString());
      if (msg?.type === "DAEMON_HELLO") {
        resolve(msg);
      } else {
        socket.close();
        reject(new Error("expected DAEMON_HELLO"));
      }
    });
  });
}

export async function connectDaemonLink(port: number, shimVersion: string): Promise<DaemonLink> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${AGENT_PATH}`);
  await awaitOpen(socket, HANDSHAKE_TIMEOUT_MS);
  socket.send(JSON.stringify(createAgentHello(shimVersion)));
  const hello = await awaitDaemonHello(socket, HANDSHAKE_TIMEOUT_MS);

  const client = new Client({ name: "pluginos-shim", version: shimVersion });
  await client.connect(new WsJsonRpcTransport(socket));

  return {
    client,
    serverVersion: hello.serverVersion,
    onClose(cb: () => void): void {
      socket.on("close", cb);
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}
