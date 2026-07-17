import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { WsJsonRpcTransport } from "../ws-json-rpc-transport.js";
import { createMcpFrame, createAgentHello } from "../protocol.js";

function fakeSocket() {
  const emitter = new EventEmitter();
  const sent: string[] = [];
  const socket = {
    on: emitter.on.bind(emitter),
    send: (data: string) => sent.push(data),
    close: vi.fn(),
  } as unknown as WebSocket;
  return { socket, emitter, sent };
}

describe("WsJsonRpcTransport", () => {
  it("delivers inbound mcp frames to onmessage", async () => {
    const { socket, emitter } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    const received: unknown[] = [];
    transport.onmessage = (m) => received.push(m);
    await transport.start();

    const payload = { jsonrpc: "2.0" as const, id: 1, method: "tools/list" };
    emitter.emit("message", Buffer.from(JSON.stringify(createMcpFrame(payload))));
    expect(received).toEqual([payload]);
  });

  it("ignores non-mcp frames (handshake stragglers, garbage)", async () => {
    const { socket, emitter } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    const received: unknown[] = [];
    transport.onmessage = (m) => received.push(m);
    await transport.start();

    emitter.emit("message", Buffer.from(JSON.stringify(createAgentHello("0.6.0"))));
    emitter.emit("message", Buffer.from("not json"));
    expect(received).toEqual([]);
  });

  it("wraps outbound messages in mcp frames", async () => {
    const { socket, sent } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    await transport.start();
    await transport.send({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(JSON.parse(sent[0])).toEqual({
      type: "mcp",
      payload: { jsonrpc: "2.0", id: 2, method: "ping" },
    });
  });

  it("fires onclose when the socket closes, and closes the socket on close()", async () => {
    const { socket, emitter } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    const onclose = vi.fn();
    transport.onclose = onclose;
    await transport.start();
    emitter.emit("close");
    expect(onclose).toHaveBeenCalledTimes(1);

    await transport.close();
    expect(socket.close).toHaveBeenCalled();
  });

  it("fires onclose exactly once when close() triggers the socket close event", async () => {
    const emitter = new EventEmitter();
    const socket = {
      on: emitter.on.bind(emitter),
      send: vi.fn(),
      // Mimic a real ws socket: close() eventually emits "close".
      close: vi.fn(() => emitter.emit("close")),
    } as unknown as WebSocket;
    const transport = new WsJsonRpcTransport(socket);
    const onclose = vi.fn();
    transport.onclose = onclose;
    await transport.start();

    await transport.close();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("fires onclose exactly once on peer-initiated close", async () => {
    const { socket, emitter } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    const onclose = vi.fn();
    transport.onclose = onclose;
    await transport.start();

    emitter.emit("close");
    emitter.emit("close");
    await transport.close();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("routes socket errors to onerror", async () => {
    const { socket, emitter } = fakeSocket();
    const transport = new WsJsonRpcTransport(socket);
    const onerror = vi.fn();
    transport.onerror = onerror;
    await transport.start();
    emitter.emit("error", new Error("boom"));
    expect(onerror).toHaveBeenCalledWith(new Error("boom"));
  });
});
