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
    const onOpen = (): void => {
      clearTimeout(timer);
      socket.off("error", onError);
      resolve();
    };
    const onError = (err: Error): void => {
      clearTimeout(timer);
      socket.off("open", onOpen);
      reject(err);
    };
    const timer = setTimeout(() => {
      socket.off("open", onOpen);
      socket.off("error", onError);
      socket.terminate();
      reject(new Error("agent socket open timeout"));
    }, timeoutMs);
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

// Exported for testing: this phase owns its own message/error listeners and
// removes them on every settle path so a later error (e.g. the daemon
// dropping the socket right after open) rejects immediately instead of
// waiting out the full handshake timeout.
export function awaitDaemonHello(socket: WebSocket, timeoutMs: number): Promise<DaemonHello> {
  return new Promise((resolve, reject) => {
    const settle = (): void => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    // once(): the hello listener must be consumed before the transport
    // attaches its own message listener.
    const onMessage = (data: Buffer | string): void => {
      settle();
      const msg = parseAgentMessage(data.toString());
      if (msg?.type === "DAEMON_HELLO") {
        resolve(msg);
      } else {
        socket.close();
        reject(new Error("expected DAEMON_HELLO"));
      }
    };
    const onError = (err: Error): void => {
      settle();
      reject(err);
    };
    const timer = setTimeout(() => {
      settle();
      socket.close();
      reject(new Error("DAEMON_HELLO timeout"));
    }, timeoutMs);
    socket.once("message", onMessage);
    socket.once("error", onError);
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
