import { describe, it, expect } from "vitest";
import {
  AGENT_PROTOCOL_VERSION,
  AGENT_PATH,
  createAgentHello,
  createDaemonHello,
  createMcpFrame,
  parseAgentMessage,
} from "../protocol.js";

describe("agent protocol", () => {
  it("exposes protocol constants", () => {
    expect(AGENT_PROTOCOL_VERSION).toBe(1);
    expect(AGENT_PATH).toBe("/agent");
  });

  it("creates an AGENT_HELLO with the current protocol version", () => {
    expect(createAgentHello("0.6.0")).toEqual({
      type: "AGENT_HELLO",
      agentProtocol: 1,
      shimVersion: "0.6.0",
    });
    expect(createAgentHello("0.6.0", "session-a").sessionLabel).toBe("session-a");
  });

  it("creates a DAEMON_HELLO", () => {
    expect(createDaemonHello("0.6.0")).toEqual({
      type: "DAEMON_HELLO",
      agentProtocol: 1,
      serverVersion: "0.6.0",
    });
  });

  it("wraps a JSON-RPC payload in an mcp frame", () => {
    const payload = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    expect(createMcpFrame(payload)).toEqual({ type: "mcp", payload });
  });

  it("round-trips messages through parseAgentMessage", () => {
    const hello = createAgentHello("0.6.0");
    expect(parseAgentMessage(JSON.stringify(hello))).toEqual(hello);
    const frame = createMcpFrame({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(parseAgentMessage(JSON.stringify(frame))).toEqual(frame);
  });

  it("returns null for garbage, non-objects, and unknown types", () => {
    expect(parseAgentMessage("not json")).toBeNull();
    expect(parseAgentMessage('"a string"')).toBeNull();
    expect(parseAgentMessage('{"type":"SOMETHING_ELSE"}')).toBeNull();
    expect(parseAgentMessage('{"type":"mcp"}')).toBeNull(); // mcp frame requires payload
  });

  it("returns null for hello messages with missing or wrong-typed fields", () => {
    expect(parseAgentMessage('{"type":"AGENT_HELLO"}')).toBeNull();
    expect(
      parseAgentMessage('{"type":"AGENT_HELLO","agentProtocol":1,"shimVersion":42}')
    ).toBeNull();
    expect(
      parseAgentMessage(
        '{"type":"AGENT_HELLO","agentProtocol":1,"shimVersion":"0.6.0","sessionLabel":7}'
      )
    ).toBeNull();
    expect(parseAgentMessage('{"type":"DAEMON_HELLO"}')).toBeNull();
    expect(
      parseAgentMessage('{"type":"DAEMON_HELLO","agentProtocol":"1","serverVersion":"0.7.0"}')
    ).toBeNull();
  });

  it("round-trips a valid DAEMON_HELLO", () => {
    const hello = createDaemonHello("0.7.0");
    expect(parseAgentMessage(JSON.stringify(hello))).toEqual(hello);
  });
});
