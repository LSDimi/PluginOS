// Shim <-> daemon attach protocol. agentProtocol is deliberately decoupled
// from the package semver: it gates only this framing, so cross-version
// shims can attach as long as the framing is unchanged.

export const AGENT_PROTOCOL_VERSION = 1;
export const AGENT_PATH = "/agent";
export const HANDSHAKE_TIMEOUT_MS = 2000;

export interface AgentHello {
  type: "AGENT_HELLO";
  agentProtocol: number;
  shimVersion: string;
  sessionLabel?: string;
}

export interface DaemonHello {
  type: "DAEMON_HELLO";
  agentProtocol: number;
  serverVersion: string;
}

export interface McpFrame {
  type: "mcp";
  payload: unknown;
}

export type AgentMessage = AgentHello | DaemonHello | McpFrame;

export function createAgentHello(shimVersion: string, sessionLabel?: string): AgentHello {
  const hello: AgentHello = {
    type: "AGENT_HELLO",
    agentProtocol: AGENT_PROTOCOL_VERSION,
    shimVersion,
  };
  if (sessionLabel !== undefined) hello.sessionLabel = sessionLabel;
  return hello;
}

export function createDaemonHello(serverVersion: string): DaemonHello {
  return { type: "DAEMON_HELLO", agentProtocol: AGENT_PROTOCOL_VERSION, serverVersion };
}

export function createMcpFrame(payload: unknown): McpFrame {
  return { type: "mcp", payload };
}

export function parseAgentMessage(raw: string): AgentMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const msg = parsed as {
    type?: unknown;
    payload?: unknown;
    agentProtocol?: unknown;
    shimVersion?: unknown;
    serverVersion?: unknown;
    sessionLabel?: unknown;
  };
  if (msg.type === "AGENT_HELLO") {
    if (
      typeof msg.agentProtocol === "number" &&
      typeof msg.shimVersion === "string" &&
      (msg.sessionLabel === undefined || typeof msg.sessionLabel === "string")
    ) {
      return parsed as AgentHello;
    }
    return null;
  }
  if (msg.type === "DAEMON_HELLO") {
    if (typeof msg.agentProtocol === "number" && typeof msg.serverVersion === "string") {
      return parsed as DaemonHello;
    }
    return null;
  }
  if (msg.type === "mcp" && msg.payload !== undefined) {
    return parsed as McpFrame;
  }
  return null;
}
