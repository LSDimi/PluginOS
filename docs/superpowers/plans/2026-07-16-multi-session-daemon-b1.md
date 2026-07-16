# Multi-Session Daemon PR-B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** N concurrent Claude sessions share one PluginOS daemon: every `pluginos` process is a permanent stdio shim; exactly one also hosts the daemon role (bridge + HTTP + WS); sessions attach over a `/agent` WebSocket path, so no session's MCP transport ever dies because another session started or ended.

**Architecture:** Per spec `docs/superpowers/specs/2026-07-16-multi-session-daemon-design.md`. Every process runs a *session layer* (stdio MCP server that forwards `tools/list` + `tools/call` to the current daemon over WS). On startup a *role decision* attaches to an equal-version daemon or binds as daemon (existing reap takeover for anything else). The daemon serves per-agent `McpServer` instances on `/agent`; its own session layer attaches via localhost loopback (uniform code path — resolves spec open question 1 in favor of loopback). Daemon lifetime = "any agents attached", replacing the parent-PID heartbeat; `state.json.parentAlive` now means *hasClients*.

**Scope note (deviation from spec sequencing, deliberate):** basic crash-failover promotion ships in B1, not B2 — the shim's reattach loop simply re-runs the same role decision used at startup, so promotion is the same code path as "first process binds". Excluding it would strand N sessions when the daemon-hosting session ends, which defeats B1's purpose. B2 retains: strict-semver policy, DEMOTE handover, `PLUGINOS_VERSION_OVERRIDE` hook, multi-file `_hint`.

**Tech Stack:** TypeScript (strict, ES2022/ESNext, bundler resolution), `@modelcontextprotocol/sdk` ^1.12.0 (`Client`, low-level `Server`, `Transport`, `InMemoryTransport`, `StdioClientTransport`), `ws` ^8.21.0, Vitest, tsup. All changes in `packages/mcp-server` — **zero changes to bridge-plugin, shared, or claude-plugin sources** (claude-plugin only if `sync-ops` drift appears, which it should not: no operations change).

## Global Constraints

- Node >= 18 (global `fetch` available; used for the `/state.json` probe).
- Agent attach protocol version: `AGENT_PROTOCOL_VERSION = 1`; attach path is `/agent`; handshake timeout 2000 ms.
- Shim forwarded-call timeout: 600_000 ms (must exceed `wait_for_reconnect`'s 300 s max).
- Between-daemons wait before a call errors: 10_000 ms; background reattach retry every 5000 ms; reconnect jitter 100–350 ms.
- Daemon self-exit grace when zero agents attached: reuse `ORPHAN_GRACE_MS = 30_000`.
- `state.json` stays `version: 1`; new fields `agentProtocol`, `attachedAgents` are additive; `parentAlive` semantics become *hasClients*.
- B1 attach condition: `state.serverVersion === myVersion && state.agentProtocol === AGENT_PROTOCOL_VERSION` (exact equality only; everything else takes the existing bind/reap path).
- Test env vars: `PLUGINOS_STATE_DIR` (exists), `PLUGINOS_PORT_RANGE` (new, e.g. `"9700-9705"`). Tests must never bind 9500–9510.
- Repo rules: build `shared` first if building; pre-push runs `npm run lint && npm run format:check`; never claim tests pass without running them; commit via the `/commit` skill — plain `git commit` shown in steps means "invoke Skill(commit)" with that message intent, never add co-author trailers.
- Prettier + ESLint must pass; run `npx prettier --write <files>` before each commit.

## File Structure (all under `packages/mcp-server/`)

| File | Responsibility |
|---|---|
| `src/agent/protocol.ts` (new) | Attach-protocol constants, message types, factories, parser |
| `src/agent/ws-json-rpc-transport.ts` (new) | MCP `Transport` over a `ws` socket carrying `{type:"mcp",payload}` frames (used by both daemon and shim sides) |
| `src/agent/upgrade-router.ts` (new) | Single HTTP `upgrade` listener routing by pathname to registered `WebSocketServer`s + origin allowlist |
| `src/agent/daemon-endpoint.ts` (new) | `/agent` acceptor: handshake, per-agent `McpServer`, agent count tracking |
| `src/lifetime.ts` (new) | Zero-agents grace timer (start/cancel/expire) |
| `src/role.ts` (new) | `decideRole()` (attach vs bind) + `probeStateEndpoint()` |
| `src/daemon.ts` (new) | `runDaemon()`: everything today's `main()` daemon path does + agent endpoint + lifetime + state writes |
| `src/shim/daemon-link.ts` (new) | WS client + handshake + SDK `Client` = one attached link |
| `src/shim/passthrough-server.ts` (new) | Low-level stdio-facing `Server` forwarding tools/list + tools/call to the current link |
| `src/shim/link-manager.ts` (new) | Attach/reattach/promote loop; owns the current link and optional in-process daemon |
| `src/WebSocketPluginBridge.ts` (modify) | `httpServer` mode switches to `noServer` WSS registered on an internal `UpgradeRouter`; expose `getRouter()` |
| `src/server.ts` (modify) | `createPluginOSServer(bridge, opts?)`; `get_status` gains `attachedAgents` |
| `src/singleton/types.ts`, `state-file.ts`, `index.ts` (modify) | New state fields; `holdLock` + `recheckAttachable` options; `releaseSingletonLock`; export `defaultStateDir` |
| `src/index.ts` (rewrite `main()`) | Parse `PLUGINOS_PORT_RANGE`, run the session layer (which attaches or hosts) |
| Tests | Mirrored under `src/agent/__tests__/`, `src/shim/__tests__/`, `src/__tests__/` |

---

### Task 1: Agent attach protocol module

**Files:**
- Create: `packages/mcp-server/src/agent/protocol.ts`
- Test: `packages/mcp-server/src/agent/__tests__/protocol.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AGENT_PROTOCOL_VERSION: 1`, `AGENT_PATH = "/agent"`, types `AgentHello`, `DaemonHello`, `McpFrame`, `AgentMessage`; factories `createAgentHello(shimVersion: string, sessionLabel?: string): AgentHello`, `createDaemonHello(serverVersion: string): DaemonHello`, `createMcpFrame(payload: unknown): McpFrame`; parser `parseAgentMessage(raw: string): AgentMessage | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/agent/__tests__/protocol.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "<repo-root>" && npm test -w packages/mcp-server -- protocol.test`
Expected: FAIL — `Cannot find module '../protocol.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// packages/mcp-server/src/agent/protocol.ts
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
  const msg = parsed as { type?: unknown; payload?: unknown };
  if (msg.type === "AGENT_HELLO" || msg.type === "DAEMON_HELLO") {
    return parsed as AgentMessage;
  }
  if (msg.type === "mcp" && msg.payload !== undefined) {
    return parsed as McpFrame;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/mcp-server -- protocol.test`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): add agent attach protocol module`

---

### Task 2: WebSocket JSON-RPC transport

**Files:**
- Create: `packages/mcp-server/src/agent/ws-json-rpc-transport.ts`
- Test: `packages/mcp-server/src/agent/__tests__/ws-json-rpc-transport.test.ts`

**Interfaces:**
- Consumes: `createMcpFrame`, `parseAgentMessage` from Task 1.
- Produces: `class WsJsonRpcTransport implements Transport` with `constructor(socket: WebSocket)` (a `ws` socket, works identically for server-accepted and client-created sockets), `start()`, `send(message: JSONRPCMessage)`, `close()`, and the `onmessage`/`onclose`/`onerror` callback properties the SDK assigns.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/agent/__tests__/ws-json-rpc-transport.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- ws-json-rpc-transport`
Expected: FAIL — `Cannot find module '../ws-json-rpc-transport.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// packages/mcp-server/src/agent/ws-json-rpc-transport.ts
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

  constructor(private socket: WebSocket) {}

  async start(): Promise<void> {
    this.socket.on("message", (data: Buffer | string) => {
      const msg = parseAgentMessage(data.toString());
      if (msg?.type === "mcp") {
        this.onmessage?.(msg.payload as JSONRPCMessage);
      }
    });
    this.socket.on("close", () => this.onclose?.());
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
    this.onclose?.();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/mcp-server -- ws-json-rpc-transport`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): add WS JSON-RPC transport for agent attach`

---

### Task 3: Upgrade router + bridge refactor to path-routed WebSockets

The plugin WSS currently attaches with `new WebSocketServer({ server })`, which claims **every** HTTP upgrade. Two WSS instances on one HTTP server conflict (each aborts non-matching upgrades), so both must become `noServer: true` behind one router that owns the single `upgrade` listener.

**Files:**
- Create: `packages/mcp-server/src/agent/upgrade-router.ts`
- Modify: `packages/mcp-server/src/WebSocketPluginBridge.ts` (constructor + `tryPort` httpServer branch)
- Test: `packages/mcp-server/src/agent/__tests__/upgrade-router.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `class UpgradeRouter { constructor(httpServer: http.Server); register(path: string, wss: WebSocketServer): void }`, `isAllowedOrigin(origin: string | undefined): boolean`; `WebSocketPluginBridge.getRouter(): UpgradeRouter | null` (non-null iff constructed with `httpServer`). Plugin WS path is `"/"` (the Figma UI connects to `ws://localhost:<port>` which is pathname `/` — unchanged on the wire).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/agent/__tests__/upgrade-router.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { UpgradeRouter, isAllowedOrigin } from "../upgrade-router.js";

const PORT = 9711;

describe("isAllowedOrigin", () => {
  it("allows missing, null, and figma origins; rejects others", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("null")).toBe(true);
    expect(isAllowedOrigin("https://www.figma.com")).toBe(true);
    expect(isAllowedOrigin("https://figma.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });
});

describe("UpgradeRouter", () => {
  let httpServer: Server;
  let router: UpgradeRouter;
  let wssRoot: WebSocketServer;
  let wssAgent: WebSocketServer;

  beforeEach(async () => {
    httpServer = createServer();
    router = new UpgradeRouter(httpServer);
    wssRoot = new WebSocketServer({ noServer: true });
    wssAgent = new WebSocketServer({ noServer: true });
    router.register("/", wssRoot);
    router.register("/agent", wssAgent);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    wssRoot.close();
    wssAgent.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  function connect(path: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}`);
      ws.on("open", () => {
        ws.close();
        resolve({ ok: true });
      });
      ws.on("error", () => resolve({ ok: false }));
    });
  }

  it("routes / and /agent to their respective servers", async () => {
    const rootConn = new Promise<string>((r) => wssRoot.on("connection", () => r("root")));
    const agentConn = new Promise<string>((r) => wssAgent.on("connection", () => r("agent")));

    expect((await connect("/")).ok).toBe(true);
    expect((await connect("/agent")).ok).toBe(true);
    expect(await rootConn).toBe("root");
    expect(await agentConn).toBe("agent");
  });

  it("rejects unknown paths", async () => {
    expect((await connect("/nope")).ok).toBe(false);
  });

  it("rejects disallowed origins", async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`, {
        headers: { origin: "https://evil.example.com" },
      });
      ws.on("open", () => {
        ws.close();
        resolve({ ok: true });
      });
      ws.on("error", () => resolve({ ok: false }));
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- upgrade-router`
Expected: FAIL — `Cannot find module '../upgrade-router.js'`

- [ ] **Step 3: Write the router implementation**

```typescript
// packages/mcp-server/src/agent/upgrade-router.ts
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
```

- [ ] **Step 4: Run router test to verify it passes**

Run: `npm test -w packages/mcp-server -- upgrade-router`
Expected: PASS (5 tests)

- [ ] **Step 5: Refactor `WebSocketPluginBridge` to use the router**

In `packages/mcp-server/src/WebSocketPluginBridge.ts`:

Add imports at the top:

```typescript
import { UpgradeRouter } from "./agent/upgrade-router.js";
```

Add a private field and constructor wiring (constructor currently sets `this.httpServer = options?.httpServer ?? null;`):

```typescript
  private router: UpgradeRouter | null = null;

  constructor(options?: WebSocketServerOptions) {
    this.options = {
      portRange: options?.portRange ?? [9500, 9510],
    };
    this.httpServer = options?.httpServer ?? null;
    if (this.httpServer) {
      this.router = new UpgradeRouter(this.httpServer);
    }
  }

  getRouter(): UpgradeRouter | null {
    return this.router;
  }
```

Replace the `onListening` body inside `tryPort`'s `if (this.httpServer)` branch. Current code:

```typescript
        const onListening = () => {
          cleanup();
          const wss = new WebSocketServer({ server: this.httpServer!, verifyClient });
          this.wss = wss;
          this.setupServer();
          resolve();
        };
```

New code (origin checking moves to the router for this mode; the standalone test-mode branch below it keeps its existing `verifyClient` untouched):

```typescript
        const onListening = () => {
          cleanup();
          const wss = new WebSocketServer({ noServer: true });
          this.router!.register("/", wss);
          this.wss = wss;
          this.setupServer();
          resolve();
        };
```

The existing `verifyClient` const stays (still used by the standalone branch). Registering `"/"` again after a failed port attempt just overwrites the map entry — safe, and the noServer WSS holds no port so no leak (the failed-attempt WSS is never created anymore in this branch; only the listening callback creates one).

- [ ] **Step 6: Run the full existing websocket + http suites to verify no regression**

Run: `npm test -w packages/mcp-server -- websocket http-state http-server integration`
Expected: PASS — all pre-existing tests green (`websocket.test.ts`, `websocket-edge.test.ts`, `websocket-port-retry.test.ts`, `http-state-endpoint.test.ts`, `http-server.test.ts`, `integration.test.ts`).

- [ ] **Step 7: Commit**

Invoke Skill(commit) — message intent: `refactor(mcp-server): route HTTP upgrades by path via UpgradeRouter`

---

### Task 4: `get_status` reports attached agents

**Files:**
- Modify: `packages/mcp-server/src/server.ts:12-16` (signature) and the `get_status` tool (~line 186)
- Test: `packages/mcp-server/src/__tests__/server-tools.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `createPluginOSServer(bridge)` call sites (must keep working with one arg).
- Produces: `createPluginOSServer(bridge: IPluginBridge, opts?: { getAgentCount?: () => number })`; when `getAgentCount` is provided, `get_status`'s JSON gains `"attachedAgents": <number>`.

- [ ] **Step 1: Write the failing test**

Append to `packages/mcp-server/src/__tests__/server-tools.test.ts` (reuse the file's existing `createMockBridge` and `setupClientServer` helpers; add a second setup helper next to `setupClientServer`):

```typescript
async function setupClientServerWithOpts(
  bridge: IPluginBridge,
  opts: { getAgentCount?: () => number }
) {
  const server = createPluginOSServer(bridge, opts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client };
}

describe("get_status attachedAgents", () => {
  it("includes attachedAgents when a counter is provided", async () => {
    const bridge = createMockBridge();
    const { client } = await setupClientServerWithOpts(bridge, { getAgentCount: () => 3 });
    const result = (await client.callTool({ name: "get_status", arguments: {} })) as ToolResult;
    const status = JSON.parse(result.content[0].text);
    expect(status.attachedAgents).toBe(3);
    expect(status.connected).toBe(true);
  });

  it("omits attachedAgents without a counter (back-compat)", async () => {
    const bridge = createMockBridge();
    const { client, clientTransport, serverTransport } = await setupClientServer(bridge);
    const result = (await client.callTool({ name: "get_status", arguments: {} })) as ToolResult;
    const status = JSON.parse(result.content[0].text);
    expect(status).not.toHaveProperty("attachedAgents");
    await clientTransport.close();
    await serverTransport.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- server-tools`
Expected: FAIL — first new test: `attachedAgents` is `undefined`.

- [ ] **Step 3: Implement**

In `packages/mcp-server/src/server.ts`, change the function signature:

```typescript
export interface ServerOptions {
  getAgentCount?: () => number;
}

export function createPluginOSServer(bridge: IPluginBridge, opts: ServerOptions = {}) {
```

And in the `get_status` handler, replace:

```typescript
    async () => {
      const status = bridge.getStatus();
```

with:

```typescript
    async () => {
      const status = {
        ...bridge.getStatus(),
        ...(opts.getAgentCount ? { attachedAgents: opts.getAgentCount() } : {}),
      };
```

- [ ] **Step 4: Run the full server-tools suite**

Run: `npm test -w packages/mcp-server -- server-tools server-dip wait-for-reconnect execute-with-lint`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): expose attachedAgents in get_status`

---

### Task 5: Singleton extensions — state fields, lock hold, attach recheck

**Files:**
- Modify: `packages/mcp-server/src/singleton/types.ts`, `packages/mcp-server/src/singleton/state-file.ts`, `packages/mcp-server/src/singleton/index.ts`
- Test: `packages/mcp-server/src/singleton/__tests__/state-file.test.ts`, `packages/mcp-server/src/singleton/__tests__/orchestrator.test.ts` (add cases)

**Interfaces:**
- Consumes: existing singleton modules.
- Produces:
  - `StateFile` gains `agentProtocol?: number; attachedAgents?: number` (optional — old files still parse).
  - `BuildStateInput` gains `agentProtocol: number; attachedAgents: number`.
  - `acquireSingletonLock(opts)` gains `holdLock?: boolean` (skip the pre-return `releaseLock`; caller must call `releaseSingletonLock`) and `recheckAttachable?: () => Promise<{ port: number } | null>` (run under the lock, *before* any reap; a non-null result short-circuits: release lock, return `{ attachInsteadPort }`).
  - `SingletonInfo` gains `attachInsteadPort?: number; holdingLock?: boolean`.
  - New export `releaseSingletonLock(info: SingletonInfo): Promise<void>`.
  - New export `defaultStateDir(): string` (currently a private function in `singleton/index.ts` — export it).

- [ ] **Step 1: Write the failing tests**

Append to `packages/mcp-server/src/singleton/__tests__/state-file.test.ts`:

```typescript
import { buildStateFile } from "../state-file.js";

describe("state file v1 additive fields", () => {
  it("includes agentProtocol and attachedAgents", () => {
    const state = buildStateFile({
      pid: 1,
      port: 9500,
      serverVersion: "0.7.0",
      parentPid: 2,
      parentAlive: true,
      agentProtocol: 1,
      attachedAgents: 0,
    });
    expect(state.agentProtocol).toBe(1);
    expect(state.attachedAgents).toBe(0);
    expect(state.version).toBe(1);
  });
});
```

(Adapt the import to the file's existing import style — it already imports from `../state-file.js`.)

Append to `packages/mcp-server/src/singleton/__tests__/orchestrator.test.ts` (this file already creates temp state dirs; follow its existing setup pattern for `stateDir`):

```typescript
import { acquireSingletonLock, releaseSingletonLock } from "../index.js";
import { access } from "node:fs/promises";
import { join } from "node:path";

describe("acquireSingletonLock holdLock + recheckAttachable", () => {
  it("returns attachInsteadPort and releases the lock when recheck finds a daemon", async () => {
    const info = await acquireSingletonLock({
      stateDir,
      recheckAttachable: async () => ({ port: 9503 }),
    });
    expect(info.attachInsteadPort).toBe(9503);
    // Lock must be released — a second acquisition succeeds immediately.
    const again = await acquireSingletonLock({ stateDir });
    expect(again.attachInsteadPort).toBeUndefined();
  });

  it("holds the lock until releaseSingletonLock when holdLock is set", async () => {
    const info = await acquireSingletonLock({ stateDir, holdLock: true });
    expect(info.holdingLock).toBe(true);
    await access(join(stateDir, "server.pid.lock")); // still present
    await releaseSingletonLock(info);
    await expect(access(join(stateDir, "server.pid.lock"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/mcp-server -- state-file orchestrator`
Expected: FAIL — type errors on new `BuildStateInput` fields / unknown options.

- [ ] **Step 3: Implement**

`packages/mcp-server/src/singleton/types.ts` — extend `StateFile` and `SingletonInfo`:

```typescript
export interface StateFile {
  version: 1;
  pid: number;
  port: number;
  serverVersion: string;
  startedAt: number;
  parentPid: number;
  /** Since B1 this means "has clients": own session open OR >=1 agent attached. */
  parentAlive: boolean;
  socketPath: string | null;
  /** Attach-protocol version served on /agent. Absent on pre-B1 servers. */
  agentProtocol?: number;
  /** Diagnostics only. */
  attachedAgents?: number;
}

export interface SingletonInfo {
  takeoverFromPid?: number;
  stateDir: string;
  pidFilePath: string;
  stateFilePath: string;
  lockFilePath: string;
  /** Set when recheckAttachable found a live daemon — caller should attach to this port. */
  attachInsteadPort?: number;
  /** Set when holdLock was requested and the lock is still held. */
  holdingLock?: boolean;
}
```

`packages/mcp-server/src/singleton/state-file.ts` — extend `BuildStateInput` and `buildStateFile`:

```typescript
export interface BuildStateInput {
  pid: number;
  port: number;
  serverVersion: string;
  parentPid: number;
  parentAlive: boolean;
  agentProtocol: number;
  attachedAgents: number;
}

export function buildStateFile(input: BuildStateInput): StateFile {
  return {
    version: 1,
    pid: input.pid,
    port: input.port,
    serverVersion: input.serverVersion,
    startedAt: Date.now(),
    parentPid: input.parentPid,
    parentAlive: input.parentAlive,
    socketPath: null,
    agentProtocol: input.agentProtocol,
    attachedAgents: input.attachedAgents,
  };
}
```

Update the one existing `buildStateFile` caller in `packages/mcp-server/src/singleton/__tests__/fixtures/mock-server.ts` to pass `agentProtocol: 1, attachedAgents: 0` (and Task 9 rewires `src/index.ts`'s caller). Search for other callers: `grep -rn "buildStateFile(" packages/mcp-server/src`.

`packages/mcp-server/src/singleton/index.ts` — extend `AcquireOptions`, insert the recheck, honor `holdLock`, add `releaseSingletonLock`, export `defaultStateDir`:

```typescript
export interface AcquireOptions {
  stateDir?: string;
  /** Keep the lock held on return; caller must call releaseSingletonLock. */
  holdLock?: boolean;
  /**
   * Run under the lock BEFORE any reap. Returning a port aborts the
   * acquisition (lock released, attachInsteadPort set) — this closes the
   * race where two processes decide to bind simultaneously and the loser
   * would otherwise reap the winner.
   */
  recheckAttachable?: () => Promise<{ port: number } | null>;
}

export function defaultStateDir(): string {
  return process.env.PLUGINOS_STATE_DIR ?? join(homedir(), ".pluginos");
}
```

(Remove the old private `defaultStateDir` — same body, now exported.)

Inside `acquireSingletonLock`, right after the lock is acquired (`if (!lock.acquired) {...}` block) and before the `readPidFile` logic, insert:

```typescript
  if (opts.recheckAttachable) {
    const attachable = await opts.recheckAttachable();
    if (attachable) {
      await releaseLock(lockFilePath);
      return { stateDir, pidFilePath, stateFilePath, lockFilePath, attachInsteadPort: attachable.port };
    }
  }
```

Then change every successful-return path at the end of the function (the `oldPid === process.pid` early return and the final return) to honor `holdLock`:

```typescript
  if (!opts.holdLock) {
    await releaseLock(lockFilePath);
    return { takeoverFromPid, stateDir, pidFilePath, stateFilePath, lockFilePath };
  }
  return { takeoverFromPid, stateDir, pidFilePath, stateFilePath, lockFilePath, holdingLock: true };
```

(The `oldPid === process.pid` early-return keeps its unconditional release — a process re-acquiring its own lock has nothing to coordinate.)

Add:

```typescript
export async function releaseSingletonLock(info: SingletonInfo): Promise<void> {
  if (info.holdingLock) {
    await releaseLock(info.lockFilePath);
    info.holdingLock = false;
  }
}
```

- [ ] **Step 4: Run the whole singleton suite**

Run: `npm test -w packages/mcp-server -- singleton`
Expected: PASS — all existing lockfile/pid-file/takeover/orchestrator/state-file/integration tests plus the new cases.

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): singleton lock hold + attach recheck + state fields`

---

### Task 6: Daemon lifetime (zero-agents grace timer)

**Files:**
- Create: `packages/mcp-server/src/lifetime.ts`
- Test: `packages/mcp-server/src/__tests__/lifetime.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class DaemonLifetime { constructor(opts: { graceMs?: number; onExpire: () => void }); update(agentCount: number): void; dispose(): void }`. Timer starts when count is 0 (including the initial `update(0)` at daemon boot), cancels on count > 0, fires `onExpire` once after `graceMs` (default 30_000).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/lifetime.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonLifetime } from "../lifetime.js";

describe("DaemonLifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("expires after graceMs at zero agents", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("cancels the timer when an agent attaches", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(20_000);
    lt.update(1);
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("restarts a full grace period when count drops to zero again", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    lt.update(2);
    lt.update(0);
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not double-schedule on repeated zero updates", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(15_000);
    lt.update(0);
    vi.advanceTimersByTime(15_000);
    expect(onExpire).toHaveBeenCalledTimes(1); // original timer, not reset
  });

  it("dispose cancels everything", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    lt.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- lifetime`
Expected: FAIL — `Cannot find module '../lifetime.js'`

- [ ] **Step 3: Implement**

```typescript
// packages/mcp-server/src/lifetime.ts
export interface LifetimeOptions {
  graceMs?: number;
  onExpire: () => void;
}

/**
 * Daemon self-termination policy: exit ORPHAN_GRACE_MS after the last
 * client detaches. Replaces the parent-PID heartbeat — a daemon whose own
 * session ended keeps serving other attached sessions.
 */
export class DaemonLifetime {
  private timer: NodeJS.Timeout | null = null;
  private readonly graceMs: number;

  constructor(private opts: LifetimeOptions) {
    this.graceMs = opts.graceMs ?? 30_000;
  }

  update(agentCount: number): void {
    if (agentCount > 0) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.opts.onExpire(), this.graceMs);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/mcp-server -- lifetime`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): add daemon lifetime grace timer`

---

### Task 7: Role decision

**Files:**
- Create: `packages/mcp-server/src/role.ts`
- Test: `packages/mcp-server/src/__tests__/role.test.ts`

**Interfaces:**
- Consumes: `readStateFile` from `./singleton/index.js`, `StateFile` type, `AGENT_PROTOCOL_VERSION` from `./agent/protocol.js`.
- Produces:
  - `type RoleDecision = { mode: "attach"; port: number } | { mode: "bind" }`
  - `decideRole(opts: { stateDir: string; myVersion: string; probe?: (port: number) => Promise<StateFile | null> }): Promise<RoleDecision>`
  - `probeStateEndpoint(port: number, timeoutMs?: number): Promise<StateFile | null>` (GET `http://127.0.0.1:<port>/state.json`, 300 ms default timeout, `null` on any failure)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/role.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideRole } from "../role.js";
import type { StateFile } from "../singleton/index.js";

function stateFixture(overrides: Partial<StateFile> = {}): StateFile {
  return {
    version: 1,
    pid: 4242,
    port: 9502,
    serverVersion: "0.7.0",
    startedAt: Date.now(),
    parentPid: 1,
    parentAlive: true,
    socketPath: null,
    agentProtocol: 1,
    attachedAgents: 1,
    ...overrides,
  };
}

describe("decideRole", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-role-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeState(state: StateFile): Promise<void> {
    await writeFile(join(dir, "state.json"), JSON.stringify(state));
  }

  it("binds when no state file exists", async () => {
    const decision = await decideRole({ stateDir: dir, myVersion: "0.7.0" });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("binds when the state file exists but the probe fails (stale daemon)", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => null,
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("attaches when the live daemon has the exact same version and protocol", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async (port) => stateFixture({ port }),
    });
    expect(decision).toEqual({ mode: "attach", port: 9502 });
  });

  it("binds on version mismatch (B1: exact equality only)", async () => {
    await writeState(stateFixture());
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.1",
      probe: async () => stateFixture(),
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("binds when the daemon predates the agent protocol (no agentProtocol field)", async () => {
    await writeState(stateFixture({ agentProtocol: undefined }));
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => stateFixture({ agentProtocol: undefined }),
    });
    expect(decision).toEqual({ mode: "bind" });
  });

  it("trusts the probed state (HTTP) over the disk state for the port", async () => {
    await writeState(stateFixture({ port: 9502 }));
    const decision = await decideRole({
      stateDir: dir,
      myVersion: "0.7.0",
      probe: async () => stateFixture({ port: 9503 }),
    });
    expect(decision).toEqual({ mode: "attach", port: 9503 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- role.test`
Expected: FAIL — `Cannot find module '../role.js'`

- [ ] **Step 3: Implement**

```typescript
// packages/mcp-server/src/role.ts
import { join } from "node:path";
import { readStateFile } from "./singleton/index.js";
import type { StateFile } from "./singleton/index.js";
import { AGENT_PROTOCOL_VERSION } from "./agent/protocol.js";

export type RoleDecision = { mode: "attach"; port: number } | { mode: "bind" };

export interface DecideRoleOptions {
  stateDir: string;
  myVersion: string;
  /** Injectable for tests; defaults to probeStateEndpoint. */
  probe?: (port: number) => Promise<StateFile | null>;
}

/** GET /state.json from a candidate daemon; null on any failure. */
export async function probeStateEndpoint(
  port: number,
  timeoutMs = 300
): Promise<StateFile | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (
        typeof body === "object" &&
        body !== null &&
        (body as { version?: unknown }).version === 1
      ) {
        return body as StateFile;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * B1 policy: attach only to a live daemon with the EXACT same package
 * version and agent protocol. Anything else takes the bind path (where the
 * existing takeover reaps incompatible/stale servers). B2 replaces exact
 * equality with strict-semver ordering + DEMOTE handover.
 */
export async function decideRole(opts: DecideRoleOptions): Promise<RoleDecision> {
  const onDisk = await readStateFile(join(opts.stateDir, "state.json"));
  if (!onDisk) return { mode: "bind" };
  const probe = opts.probe ?? probeStateEndpoint;
  const live = await probe(onDisk.port);
  if (!live) return { mode: "bind" };
  if (live.serverVersion === opts.myVersion && live.agentProtocol === AGENT_PROTOCOL_VERSION) {
    return { mode: "attach", port: live.port };
  }
  return { mode: "bind" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/mcp-server -- role.test`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): add attach-vs-bind role decision`

---

### Task 8: Agent endpoint (daemon side of `/agent`)

**Files:**
- Create: `packages/mcp-server/src/agent/daemon-endpoint.ts`
- Test: `packages/mcp-server/src/agent/__tests__/daemon-endpoint.test.ts`

**Interfaces:**
- Consumes: Task 1 protocol, Task 2 transport, Task 3 `UpgradeRouter`, Task 4 `createPluginOSServer(bridge, opts)`.
- Produces: `class AgentEndpoint { constructor(bridge: IPluginBridge, serverVersion: string); register(router: UpgradeRouter): void; getCount(): number; onCountChange(cb: (n: number) => void): void; close(): Promise<void> }`. Behavior: on connection, expect `AGENT_HELLO` within `HANDSHAKE_TIMEOUT_MS` or close; on protocol mismatch close; otherwise reply `DAEMON_HELLO` and connect a fresh per-agent `McpServer` over `WsJsonRpcTransport` **synchronously in the same tick** (the shim's `initialize` must not race past an unattached listener); count increments on attach, decrements on socket close.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/agent/__tests__/daemon-endpoint.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import WebSocket, { type WebSocketServer } from "ws";
import type { IPluginBridge } from "@pluginos/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UpgradeRouter } from "../upgrade-router.js";
import { AgentEndpoint } from "../daemon-endpoint.js";
import { WsJsonRpcTransport } from "../ws-json-rpc-transport.js";
import { createAgentHello, parseAgentMessage } from "../protocol.js";

const PORT = 9712;

function createMockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({ id: "t", type: "result", success: true, result: [] }),
    getStatus: vi.fn().mockReturnValue({
      connected: false,
      fileKey: null,
      fileName: null,
      currentPage: null,
      port: PORT,
      connectedFiles: 0,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

/** Client-side handshake helper mirroring what daemon-link does (Task 9). */
async function openAgentSocket(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const helloReply = new Promise<void>((resolve, reject) => {
    ws.once("message", (data) => {
      const msg = parseAgentMessage(data.toString());
      msg?.type === "DAEMON_HELLO" ? resolve() : reject(new Error(`bad reply: ${String(data)}`));
    });
  });
  ws.send(JSON.stringify(createAgentHello("0.7.0")));
  await helloReply;
  return ws;
}

describe("AgentEndpoint", () => {
  let httpServer: Server;
  let endpoint: AgentEndpoint;

  beforeEach(async () => {
    httpServer = createServer();
    const router = new UpgradeRouter(httpServer);
    endpoint = new AgentEndpoint(createMockBridge(), "0.7.0");
    endpoint.register(router);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    await endpoint.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  it("serves MCP to an attached agent and tracks the count", async () => {
    const counts: number[] = [];
    endpoint.onCountChange((n) => counts.push(n));

    const ws = await openAgentSocket(PORT);
    const client = new Client({ name: "test-shim", version: "0.7.0" });
    await client.connect(new WsJsonRpcTransport(ws));

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("get_status");
    expect(names).toContain("run_operation");
    expect(endpoint.getCount()).toBe(1);

    const status = await client.callTool({ name: "get_status", arguments: {} });
    const parsed = JSON.parse(
      (status as { content: Array<{ text: string }> }).content[0].text
    );
    expect(parsed.attachedAgents).toBe(1);

    await client.close();
    await vi.waitFor(() => expect(endpoint.getCount()).toBe(0));
    expect(counts).toEqual([1, 0]);
  });

  it("supports two concurrent agents with independent MCP sessions", async () => {
    const wsA = await openAgentSocket(PORT);
    const wsB = await openAgentSocket(PORT);
    const a = new Client({ name: "shim-a", version: "0.7.0" });
    const b = new Client({ name: "shim-b", version: "0.7.0" });
    await a.connect(new WsJsonRpcTransport(wsA));
    await b.connect(new WsJsonRpcTransport(wsB));

    const [ta, tb] = await Promise.all([a.listTools(), b.listTools()]);
    expect(ta.tools.length).toBeGreaterThan(0);
    expect(tb.tools.length).toBe(ta.tools.length);
    expect(endpoint.getCount()).toBe(2);

    await a.close();
    await vi.waitFor(() => expect(endpoint.getCount()).toBe(1));
    const again = await b.listTools(); // B unaffected by A's departure
    expect(again.tools.length).toBe(tb.tools.length);
    await b.close();
  });

  it("closes sockets that send a wrong protocol version", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`);
    await new Promise<void>((r) => ws.once("open", () => r()));
    ws.send(JSON.stringify({ type: "AGENT_HELLO", agentProtocol: 99, shimVersion: "9.9.9" }));
    await new Promise<void>((r) => ws.once("close", () => r()));
    expect(endpoint.getCount()).toBe(0);
  });

  it("closes sockets that never send a hello", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`);
    await new Promise<void>((r) => ws.once("open", () => r()));
    await new Promise<void>((r) => ws.once("close", () => r())); // handshake timeout
    expect(endpoint.getCount()).toBe(0);
  }, 5000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- daemon-endpoint`
Expected: FAIL — `Cannot find module '../daemon-endpoint.js'`

- [ ] **Step 3: Implement**

```typescript
// packages/mcp-server/src/agent/daemon-endpoint.ts
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
    for (const ws of this.sockets) ws.close();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/mcp-server -- daemon-endpoint`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): serve per-agent MCP sessions on /agent`

---

### Task 9: `runDaemon()` extraction

**Files:**
- Create: `packages/mcp-server/src/daemon.ts`
- Modify: `packages/mcp-server/src/index.ts` (move `loadUiContent`, shutdown handlers, and the daemon-start body into `daemon.ts`; `index.ts` is fully rewired in Task 11 — in this task keep `main()` compiling by delegating to `runDaemon` and connecting stdio directly as before)
- Test: `packages/mcp-server/src/__tests__/daemon.test.ts`

**Interfaces:**
- Consumes: Tasks 3–8 plus existing `createHttpServer`, `WebSocketPluginBridge`, singleton exports.
- Produces:

```typescript
export interface DaemonOptions {
  stateDir: string;
  portRange: [number, number];
  version: string;
  parentPid: number;
  graceMs?: number;                 // lifetime grace, default 30_000
  onExpire?: () => void;            // default: cleanup + process.exit(0)
}
export interface DaemonHandle {
  port: number;
  agentEndpoint: AgentEndpoint;
  close(): Promise<void>;           // full teardown incl. state files (for tests)
}
/** Returns null when another process won the bind race — attach to attachInsteadPort instead. */
export async function runDaemon(opts: DaemonOptions): Promise<DaemonHandle | { attachInsteadPort: number } | null>
```

Behavior contract: acquire lock with `holdLock: true` and `recheckAttachable` = `decideRole` re-probe (returns the port when an equal-version daemon appeared); start HTTP + bridge; register `AgentEndpoint` on the bridge's router; write pid + `state.json` (with `agentProtocol: AGENT_PROTOCOL_VERSION`, `attachedAgents: 0`, `parentAlive: true`); release the lock; wire `onCountChange` → rewrite `state.json` (`parentAlive: n > 0`, `attachedAgents: n`) + `lifetime.update(n)`; `lifetime.update(0)` once at boot; register SIGTERM/SIGINT/exit cleanup (moved from `index.ts` unchanged).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/daemon.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemon, type DaemonHandle } from "../daemon.js";
import { probeStateEndpoint } from "../role.js";

const RANGE: [number, number] = [9720, 9722];

describe("runDaemon", () => {
  let dir: string;
  let handle: DaemonHandle | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-daemon-"));
  });
  afterEach(async () => {
    if (handle) await handle.close();
    handle = null;
    await rm(dir, { recursive: true, force: true });
  });

  it("binds, writes state.json with agent fields, and serves /state.json", async () => {
    const result = await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("attachInsteadPort");
    handle = result as DaemonHandle;

    const onDisk = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
    expect(onDisk.port).toBe(handle.port);
    expect(onDisk.agentProtocol).toBe(1);
    expect(onDisk.attachedAgents).toBe(0);
    expect(onDisk.serverVersion).toBe("0.7.0");

    const probed = await probeStateEndpoint(handle.port);
    expect(probed?.pid).toBe(process.pid);
  });

  it("returns attachInsteadPort when an equal-version daemon is already up", async () => {
    handle = (await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    })) as DaemonHandle;

    const second = await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
    });
    expect(second).toEqual({ attachInsteadPort: handle.port });
  });

  it("updates state.json when the agent count changes", async () => {
    handle = (await runDaemon({
      stateDir: dir,
      portRange: RANGE,
      version: "0.7.0",
      parentPid: process.ppid,
      graceMs: 60_000,
      onExpire: () => {},
    })) as DaemonHandle;

    // Simulate an attach/detach through the endpoint's public counter hook.
    // (Full socket-level attach is covered by daemon-endpoint tests; here we
    // only verify the state.json plumbing.)
    const endpointAny = handle.agentEndpoint as unknown as {
      count: number;
      onChange: ((n: number) => void) | null;
    };
    endpointAny.count = 2;
    endpointAny.onChange?.(2);
    await new Promise((r) => setTimeout(r, 100));
    const onDisk = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
    expect(onDisk.attachedAgents).toBe(2);
    expect(onDisk.parentAlive).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/mcp-server -- daemon.test`
Expected: FAIL — `Cannot find module '../daemon.js'`

- [ ] **Step 3: Implement `daemon.ts`**

```typescript
// packages/mcp-server/src/daemon.ts
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpServer } from "./http-server.js";
import { WebSocketPluginBridge } from "./WebSocketPluginBridge.js";
import { AgentEndpoint } from "./agent/daemon-endpoint.js";
import { AGENT_PROTOCOL_VERSION } from "./agent/protocol.js";
import { DaemonLifetime } from "./lifetime.js";
import { decideRole } from "./role.js";
import {
  acquireSingletonLock,
  releaseSingletonLock,
  writeSingletonState,
  clearSingletonState,
  buildStateFile,
  writeStateFile,
} from "./singleton/index.js";
import type { SingletonInfo, StateFile } from "./singleton/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Moved verbatim from index.ts (delete it there in this task).
function loadUiContent(): string {
  const candidates = [
    join(__dirname, "../../bridge-plugin/dist/ui.html"),
    join(process.cwd(), "packages/bridge-plugin/dist/ui.html"),
    join(__dirname, "ui.html"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  }
  return "<html><body><p>PluginOS UI not found. Run: npm run build -w packages/bridge-plugin</p></body></html>";
}

export interface DaemonOptions {
  stateDir: string;
  portRange: [number, number];
  version: string;
  parentPid: number;
  graceMs?: number;
  onExpire?: () => void;
}

export interface DaemonHandle {
  port: number;
  agentEndpoint: AgentEndpoint;
  close(): Promise<void>;
}

export async function runDaemon(
  opts: DaemonOptions
): Promise<DaemonHandle | { attachInsteadPort: number } | null> {
  const info: SingletonInfo = await acquireSingletonLock({
    stateDir: opts.stateDir,
    holdLock: true,
    recheckAttachable: async () => {
      const decision = await decideRole({ stateDir: opts.stateDir, myVersion: opts.version });
      return decision.mode === "attach" ? { port: decision.port } : null;
    },
  });
  if (info.attachInsteadPort !== undefined) {
    return { attachInsteadPort: info.attachInsteadPort };
  }

  let currentState: StateFile | null = null;
  const httpServer = createHttpServer(
    () => loadUiContent(),
    () => currentState
  );
  const bridge = new WebSocketPluginBridge({ httpServer, portRange: opts.portRange });
  const port = await bridge.start();
  console.error(`PluginOS daemon: WebSocket + HTTP on port ${port}`);

  const agentEndpoint = new AgentEndpoint(bridge, opts.version);
  agentEndpoint.register(bridge.getRouter()!);

  const state = buildStateFile({
    pid: process.pid,
    port,
    serverVersion: opts.version,
    parentPid: opts.parentPid,
    parentAlive: true,
    agentProtocol: AGENT_PROTOCOL_VERSION,
    attachedAgents: 0,
  });
  currentState = state;
  await writeSingletonState(info, state);
  await releaseSingletonLock(info);

  const cleanup = async (): Promise<void> => {
    lifetime.dispose();
    await agentEndpoint.close();
    await bridge.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
    await clearSingletonState(info);
  };

  const lifetime = new DaemonLifetime({
    graceMs: opts.graceMs,
    onExpire:
      opts.onExpire ??
      (() => {
        console.error("[daemon] No agents attached after grace period. Exiting.");
        void cleanup().finally(() => process.exit(0));
      }),
  });
  agentEndpoint.onCountChange((n) => {
    lifetime.update(n);
    currentState = { ...state, parentAlive: n > 0, attachedAgents: n };
    void writeStateFile(info.stateFilePath, currentState).catch(() => {});
  });
  lifetime.update(0);

  registerShutdownHandlers(info);
  return { port, agentEndpoint, close: cleanup };
}

// Moved from index.ts, minus the parent-liveness timers (replaced by DaemonLifetime).
function registerShutdownHandlers(info: SingletonInfo): void {
  const cleanup = async (): Promise<void> => {
    await clearSingletonState(info);
  };
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("exit", () => {
    try {
      unlinkSync(info.stateFilePath);
    } catch {
      // ignored
    }
    try {
      unlinkSync(info.pidFilePath);
    } catch {
      // ignored
    }
  });
}
```

`DaemonHandle` must also expose the bridge so `main()` (and Task 11's tests) can reach it — add to the interface in `daemon.ts`:

```typescript
export interface DaemonHandle {
  port: number;
  bridge: IPluginBridge;
  agentEndpoint: AgentEndpoint;
  close(): Promise<void>;
}
```

and return `{ port, bridge, agentEndpoint, close: cleanup }` (import `IPluginBridge` as a type from `@pluginos/shared`; `WebSocketPluginBridge` already implements it).

In `packages/mcp-server/src/index.ts`, for this task only (Task 11 rewrites it again): delete `loadUiContent`, the parent-liveness heartbeat (`startParentLivenessHeartbeat`, `INITIAL_PARENT_PID`, `PARENT_LIVENESS_INTERVAL_MS`, `ORPHAN_GRACE_MS`, `currentParentAlive`, `selfTerminateTimeout`, `parentLivenessInterval`, `isProcessAlive`, `currentState`), `registerShutdownHandlers`, and the daemon-start body of `main()`; replace `main()` with:

```typescript
import { runDaemon } from "./daemon.js";
import { defaultStateDir } from "./singleton/index.js";

async function main(): Promise<void> {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const result = await runDaemon({
    stateDir: defaultStateDir(),
    portRange: [9500, 9510],
    version: pkg.version,
    parentPid: process.ppid,
  });
  if (result === null || "attachInsteadPort" in result) {
    // Shim mode lands in Task 11; until then, mirror old newest-wins startup.
    console.error("PluginOS: another equal-version daemon is running; exiting (shim in Task 11).");
    process.exit(0);
    return;
  }
  const mcpServer = createPluginOSServer(result.bridge, {
    getAgentCount: () => result.agentEndpoint.getCount(),
  });
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}
```

Keep the existing top-level `main().catch(...)` unchanged.

- [ ] **Step 4: Run the new test and the full package suite**

Run: `npm test -w packages/mcp-server`
Expected: PASS. Pay attention to `singleton/__tests__/integration.test.ts` (mock fixture already updated in Task 5) and typecheck via the test build. Also run `npm run typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

Invoke Skill(commit) — message intent: `refactor(mcp-server): extract runDaemon with agent endpoint and lifetime`

---

### Task 10: Shim — daemon link and passthrough server

**Files:**
- Create: `packages/mcp-server/src/shim/daemon-link.ts`
- Create: `packages/mcp-server/src/shim/passthrough-server.ts`
- Test: `packages/mcp-server/src/shim/__tests__/daemon-link.test.ts`
- Test: `packages/mcp-server/src/shim/__tests__/passthrough-server.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 8 (a live `AgentEndpoint` for the link test).
- Produces:

```typescript
// daemon-link.ts
export interface DaemonLink {
  client: Client;                  // connected SDK client
  serverVersion: string;           // from DAEMON_HELLO
  onClose(cb: () => void): void;   // socket close notification
  close(): Promise<void>;
}
export async function connectDaemonLink(port: number, shimVersion: string): Promise<DaemonLink>;
// throws on: connect failure/timeout (2s), handshake timeout (2s), bad hello

// passthrough-server.ts
export const LINK_WAIT_MS = 10_000;
export const FORWARD_TIMEOUT_MS = 600_000;
export function createShimServer(
  waitForLink: () => Promise<Client | null>,   // resolves null after LINK_WAIT_MS without a link
  shimVersion: string
): Server;                                      // low-level SDK Server, stdio-agnostic
```

- [ ] **Step 1: Write the failing passthrough test** (in-memory, no sockets)

```typescript
// packages/mcp-server/src/shim/__tests__/passthrough-server.test.ts
import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPluginOSServer } from "../../server.js";
import { createShimServer } from "../passthrough-server.js";
import type { IPluginBridge } from "@pluginos/shared";

function mockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({
      id: "t",
      type: "result",
      success: true,
      result: [{ name: "lint_styles", description: "Lint", category: "lint" }],
    }),
    getStatus: vi.fn().mockReturnValue({
      connected: true,
      fileKey: "f",
      fileName: "F",
      currentPage: "P",
      port: 9500,
      connectedFiles: 1,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

/** Wire a real PluginOS server as the "daemon" behind an in-memory link. */
async function daemonClient(): Promise<Client> {
  const daemon = createPluginOSServer(mockBridge(), { getAgentCount: () => 1 });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await daemon.connect(st);
  const client = new Client({ name: "link", version: "0.7.0" });
  await client.connect(ct);
  return client;
}

async function shimFacingClient(waitForLink: () => Promise<Client | null>) {
  const shim = createShimServer(waitForLink, "0.7.0");
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await shim.connect(st);
  const front = new Client({ name: "claude", version: "1.0.0" });
  await front.connect(ct);
  return front;
}

describe("createShimServer", () => {
  it("forwards tools/list to the daemon", async () => {
    const link = await daemonClient();
    const front = await shimFacingClient(async () => link);
    const tools = await front.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("run_operation");
    expect(tools.tools.map((t) => t.name)).toContain("wait_for_reconnect");
  });

  it("forwards tools/call results verbatim, including isError", async () => {
    const link = await daemonClient();
    const front = await shimFacingClient(async () => link);
    const ok = (await front.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(ok.content[0].text).attachedAgents).toBe(1);
  });

  it("returns an isError result (not a protocol error) when no link arrives", async () => {
    const front = await shimFacingClient(async () => null);
    const result = (await front.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("daemon");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w packages/mcp-server -- passthrough-server`
Expected: FAIL — `Cannot find module '../passthrough-server.js'`

- [ ] **Step 3: Implement `passthrough-server.ts`**

```typescript
// packages/mcp-server/src/shim/passthrough-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

export const LINK_WAIT_MS = 10_000;
/** Must exceed wait_for_reconnect's 300s ceiling — the daemon owns real timeouts. */
export const FORWARD_TIMEOUT_MS = 600_000;

const UNAVAILABLE_TEXT =
  "PluginOS daemon restarting — retry this call, or call wait_for_reconnect.";

/**
 * The session layer: a stdio-facing MCP server that terminates the MCP
 * session locally (so the client never re-initializes) and forwards tool
 * traffic to whatever daemon link is current. Tool definitions are always
 * the DAEMON's — a version-skewed shim serves its daemon's surface.
 */
export function createShimServer(
  waitForLink: () => Promise<Client | null>,
  shimVersion: string
): Server {
  const server = new Server(
    { name: "pluginos", version: shimVersion },
    { capabilities: { tools: { listChanged: true } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const link = await waitForLink();
    if (!link) {
      throw new McpError(ErrorCode.InternalError, UNAVAILABLE_TEXT);
    }
    return await link.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const link = await waitForLink();
    if (!link) {
      return { content: [{ type: "text" as const, text: UNAVAILABLE_TEXT }], isError: true };
    }
    return await link.callTool(
      { name: req.params.name, arguments: req.params.arguments },
      undefined,
      { timeout: FORWARD_TIMEOUT_MS }
    );
  });

  return server;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w packages/mcp-server -- passthrough-server`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing daemon-link test** (against a real `AgentEndpoint`)

```typescript
// packages/mcp-server/src/shim/__tests__/daemon-link.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { IPluginBridge } from "@pluginos/shared";
import { UpgradeRouter } from "../../agent/upgrade-router.js";
import { AgentEndpoint } from "../../agent/daemon-endpoint.js";
import { connectDaemonLink } from "../daemon-link.js";

const PORT = 9713;

function mockBridge(): IPluginBridge {
  return {
    sendAndWait: vi.fn().mockResolvedValue({ id: "t", type: "result", success: true, result: [] }),
    getStatus: vi.fn().mockReturnValue({
      connected: false,
      fileKey: null,
      fileName: null,
      currentPage: null,
      port: PORT,
      connectedFiles: 0,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

describe("connectDaemonLink", () => {
  let httpServer: Server;
  let endpoint: AgentEndpoint;

  beforeEach(async () => {
    httpServer = createServer();
    const router = new UpgradeRouter(httpServer);
    endpoint = new AgentEndpoint(mockBridge(), "0.7.0");
    endpoint.register(router);
    await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  });

  afterEach(async () => {
    await endpoint.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  it("handshakes, reports the daemon version, and serves MCP", async () => {
    const link = await connectDaemonLink(PORT, "0.7.0");
    expect(link.serverVersion).toBe("0.7.0");
    const tools = await link.client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("get_status");
    await link.close();
  });

  it("fires onClose when the daemon side drops the socket", async () => {
    const link = await connectDaemonLink(PORT, "0.7.0");
    const closed = new Promise<void>((r) => link.onClose(r));
    await endpoint.close();
    await closed; // resolves — no assertion needed beyond completion
  });

  it("rejects when nothing listens on the port", async () => {
    await expect(connectDaemonLink(9799, "0.7.0")).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -w packages/mcp-server -- daemon-link`
Expected: FAIL — `Cannot find module '../daemon-link.js'`

- [ ] **Step 7: Implement `daemon-link.ts`**

```typescript
// packages/mcp-server/src/shim/daemon-link.ts
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
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -w packages/mcp-server -- daemon-link passthrough-server`
Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): shim daemon link and MCP passthrough server`

---

### Task 11: Link manager + session-layer `main()`

**Files:**
- Create: `packages/mcp-server/src/shim/link-manager.ts`
- Rewrite: `packages/mcp-server/src/index.ts`
- Test: `packages/mcp-server/src/shim/__tests__/link-manager.test.ts`

**Interfaces:**
- Consumes: Tasks 7, 9, 10.
- Produces:

```typescript
export interface LinkManagerDeps {                 // all injectable for tests
  decideRole: () => Promise<RoleDecision>;
  connectLink: (port: number) => Promise<DaemonLink>;
  startDaemon: () => Promise<DaemonHandle | { attachInsteadPort: number } | null>;
  onRelink?: () => void;                           // fires on every link AFTER the first (→ sendToolListChanged)
  retryDelayMs?: number;                           // base retry delay, default 5000
  jitterMs?: () => number;                          // default 100 + Math.random() * 250
}
export class LinkManager {
  constructor(deps: LinkManagerDeps);
  start(): Promise<void>;                          // establish first link (attach or promote)
  waitForLink(timeoutMs: number): Promise<Client | null>;
  isHosting(): boolean;
  hostedAgentCount(): number;                      // 0 when not hosting
  handleStdioClosed(): Promise<"exit" | "linger">; // "linger" iff hosting with other agents attached
  stop(): Promise<void>;
}
```

Behavior contract:
- `start()` runs the loop: `decideRole()` → attach → `connectLink(port)`; bind → `startDaemon()`; a `{attachInsteadPort}` result loops back to attach; any throw waits `jitterMs()` and retries (max 20 s for `start()`, then continues retrying in background — `waitForLink` governs caller-visible waiting).
- When a link's socket closes (via `DaemonLink.onClose`), clear the current link and re-run the loop in the background (this is promotion when the daemon died: `decideRole` finds nothing and `startDaemon` binds; jitter staggers racing shims — the loser gets `attachInsteadPort` from Task 5's under-lock recheck and attaches).
- `waitForLink(t)`: resolves the current link's client immediately, else the next established link within `t` ms, else `null`.
- After promotion, the manager connects a **loopback link to its own daemon** (`connectLink(handle.port)`) — the daemon's own session goes through `/agent` like everyone else (spec open question 1 → loopback; one code path, and `attachedAgents` includes self).
- `handleStdioClosed()`: not hosting → `"exit"`; hosting → close own loopback link and return `"linger"` (lifetime's zero-agent grace decides actual exit).
- `onRelink` fires on every link after the first, so `main()` can emit `notifications/tools/list_changed`.

- [ ] **Step 1: Write the failing test** (fully faked deps — no sockets)

```typescript
// packages/mcp-server/src/shim/__tests__/link-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { LinkManager, type LinkManagerDeps } from "../link-manager.js";
import type { DaemonLink } from "../daemon-link.js";
import type { DaemonHandle } from "../../daemon.js";

function fakeLink(): DaemonLink & { emitClose: () => void } {
  let closeCb: (() => void) | null = null;
  return {
    client: { fake: true } as never,
    serverVersion: "0.7.0",
    onClose(cb) {
      closeCb = cb;
    },
    close: vi.fn(async () => {}),
    emitClose() {
      closeCb?.();
    },
  };
}

function fakeHandle(port: number, count = 1): DaemonHandle {
  return {
    port,
    bridge: {} as never,
    agentEndpoint: { getCount: () => count } as never,
    close: vi.fn(async () => {}),
  } as unknown as DaemonHandle;
}

function deps(overrides: Partial<LinkManagerDeps>): LinkManagerDeps {
  return {
    decideRole: vi.fn(async () => ({ mode: "bind" as const })),
    connectLink: vi.fn(async () => fakeLink()),
    startDaemon: vi.fn(async () => fakeHandle(9500)),
    retryDelayMs: 10,
    jitterMs: () => 1,
    ...overrides,
  };
}

describe("LinkManager", () => {
  it("attaches when decideRole says attach", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => link),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(await mgr.waitForLink(100)).toBe(link.client);
    expect(mgr.isHosting()).toBe(false);
    expect(d.startDaemon).not.toHaveBeenCalled();
    await mgr.stop();
  });

  it("promotes (bind + loopback) when no daemon exists", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => fakeHandle(9501)),
      connectLink: vi.fn(async (port: number) => {
        expect(port).toBe(9501); // loopback to own daemon
        return link;
      }),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(mgr.isHosting()).toBe(true);
    expect(await mgr.waitForLink(100)).toBe(link.client);
    await mgr.stop();
  });

  it("attaches to the race winner when startDaemon reports attachInsteadPort", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => ({ attachInsteadPort: 9502 })),
      connectLink: vi.fn(async (port: number) => {
        expect(port).toBe(9502);
        return link;
      }),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(mgr.isHosting()).toBe(false);
    expect(await mgr.waitForLink(100)).toBe(link.client);
    await mgr.stop();
  });

  it("re-links after the daemon socket closes and fires onRelink", async () => {
    const first = fakeLink();
    const second = fakeLink();
    const onRelink = vi.fn();
    const connectLink = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink,
      onRelink,
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(onRelink).not.toHaveBeenCalled();

    first.emitClose();
    await vi.waitFor(async () => {
      expect(await mgr.waitForLink(50)).toBe(second.client);
    });
    expect(onRelink).toHaveBeenCalledTimes(1);
    await mgr.stop();
  });

  it("waitForLink returns null after the timeout with no link", async () => {
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => {
        throw new Error("nobody home");
      }),
    });
    const mgr = new LinkManager(d);
    void mgr.start();
    expect(await mgr.waitForLink(50)).toBeNull();
    await mgr.stop();
  });

  it("handleStdioClosed: exit when not hosting, linger when hosting with other agents", async () => {
    const link = fakeLink();
    const attached = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => link),
    });
    const attachedMgr = new LinkManager(attached);
    await attachedMgr.start();
    expect(await attachedMgr.handleStdioClosed()).toBe("exit");

    const hostLink = fakeLink();
    const hosting = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => fakeHandle(9503, 2)), // self + one other
      connectLink: vi.fn(async () => hostLink),
    });
    const hostingMgr = new LinkManager(hosting);
    await hostingMgr.start();
    expect(await hostingMgr.handleStdioClosed()).toBe("linger");
    expect(hostLink.close).toHaveBeenCalled(); // own loopback released
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w packages/mcp-server -- link-manager`
Expected: FAIL — `Cannot find module '../link-manager.js'`

- [ ] **Step 3: Implement `link-manager.ts`**

```typescript
// packages/mcp-server/src/shim/link-manager.ts
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RoleDecision } from "../role.js";
import type { DaemonHandle } from "../daemon.js";
import type { DaemonLink } from "./daemon-link.js";

export interface LinkManagerDeps {
  decideRole: () => Promise<RoleDecision>;
  connectLink: (port: number) => Promise<DaemonLink>;
  startDaemon: () => Promise<DaemonHandle | { attachInsteadPort: number } | null>;
  onRelink?: () => void;
  retryDelayMs?: number;
  jitterMs?: () => number;
}

const START_BUDGET_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Owns the shim's connection to "the current daemon" — which may be a
 * remote process or a daemon hosted in THIS process (loopback). On link
 * loss it re-runs the same decide→attach|bind loop used at startup, which
 * is what makes crash promotion the same code path as first-boot binding.
 */
export class LinkManager {
  private link: DaemonLink | null = null;
  private daemon: DaemonHandle | null = null;
  private linkWaiters: Array<(c: Client | null) => void> = [];
  private everLinked = false;
  private stopped = false;
  private looping = false;

  constructor(private deps: LinkManagerDeps) {}

  async start(): Promise<void> {
    const deadline = Date.now() + START_BUDGET_MS;
    while (!this.stopped && Date.now() < deadline) {
      if (await this.tryEstablish()) return;
      await sleep(this.jitter());
    }
    if (!this.stopped) void this.backgroundLoop();
  }

  private jitter(): number {
    return this.deps.jitterMs ? this.deps.jitterMs() : 100 + Math.random() * 250;
  }

  private async tryEstablish(): Promise<boolean> {
    try {
      const decision = await this.deps.decideRole();
      if (decision.mode === "attach") {
        return await this.attach(decision.port);
      }
      const started = await this.deps.startDaemon();
      if (started === null) return false;
      if ("attachInsteadPort" in started) {
        return await this.attach(started.attachInsteadPort);
      }
      this.daemon = started;
      return await this.attach(started.port); // loopback
    } catch (err) {
      console.error(`[shim] link attempt failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async attach(port: number): Promise<boolean> {
    const link = await this.deps.connectLink(port);
    this.link = link;
    link.onClose(() => {
      if (this.link === link) {
        this.link = null;
        if (!this.stopped) void this.backgroundLoop();
      }
    });
    if (this.everLinked) this.deps.onRelink?.();
    this.everLinked = true;
    const waiters = this.linkWaiters;
    this.linkWaiters = [];
    for (const w of waiters) w(link.client);
    return true;
  }

  private async backgroundLoop(): Promise<void> {
    if (this.looping) return;
    this.looping = true;
    try {
      while (!this.stopped && !this.link) {
        await sleep(this.jitter());
        if (await this.tryEstablish()) return;
        await sleep(this.deps.retryDelayMs ?? 5000);
      }
    } finally {
      this.looping = false;
    }
  }

  waitForLink(timeoutMs: number): Promise<Client | null> {
    if (this.link) return Promise.resolve(this.link.client);
    return new Promise((resolve) => {
      const waiter = (c: Client | null): void => {
        clearTimeout(timer);
        resolve(c);
      };
      const timer = setTimeout(() => {
        this.linkWaiters = this.linkWaiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      this.linkWaiters.push(waiter);
    });
  }

  isHosting(): boolean {
    return this.daemon !== null;
  }

  hostedAgentCount(): number {
    return this.daemon ? this.daemon.agentEndpoint.getCount() : 0;
  }

  async handleStdioClosed(): Promise<"exit" | "linger"> {
    this.stopped = true;
    if (!this.daemon) {
      await this.link?.close().catch(() => {});
      return "exit";
    }
    // Hosting: release only the loopback link; DaemonLifetime's zero-agent
    // grace decides when the process actually exits.
    await this.link?.close().catch(() => {});
    this.link = null;
    return "linger";
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.link?.close().catch(() => {});
    this.link = null;
    if (this.daemon) {
      await this.daemon.close();
      this.daemon = null;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w packages/mcp-server -- link-manager`
Expected: PASS (6 tests)

- [ ] **Step 5: Rewrite `src/index.ts` `main()` as the session layer**

Full new `main()` section (keep the existing re-exports at the top of the file — `createPluginOSServer`, `WebSocketPluginBridge`, types, singleton re-exports — untouched; delete the Task 9 transitional body). Imports:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDaemon } from "./daemon.js";
import { decideRole } from "./role.js";
import { connectDaemonLink } from "./shim/daemon-link.js";
import { createShimServer, LINK_WAIT_MS } from "./shim/passthrough-server.js";
import { LinkManager } from "./shim/link-manager.js";
import { defaultStateDir } from "./singleton/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function parsePortRange(raw: string | undefined): [number, number] {
  const m = /^(\d{2,5})-(\d{2,5})$/.exec(raw ?? "");
  if (!m) return [9500, 9510];
  const min = Number(m[1]);
  const max = Number(m[2]);
  return min <= max ? [min, max] : [9500, 9510];
}
```

Body — `createShimServer` needs the manager, which needs the shim server for `onRelink`; break the cycle with a `managerRef` holder assigned right after construction:

```typescript
async function main(): Promise<void> {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  const stateDir = defaultStateDir();
  const portRange = parsePortRange(process.env.PLUGINOS_PORT_RANGE);

  let managerRef: LinkManager | null = null;
  const shimServer = createShimServer(
    () => (managerRef ? managerRef.waitForLink(LINK_WAIT_MS) : Promise.resolve(null)),
    pkg.version
  );

  const manager = new LinkManager({
    decideRole: () => decideRole({ stateDir, myVersion: pkg.version }),
    connectLink: (port) => connectDaemonLink(port, pkg.version),
    startDaemon: () =>
      runDaemon({ stateDir, portRange, version: pkg.version, parentPid: process.ppid }),
    onRelink: () => {
      void shimServer.sendToolListChanged().catch(() => {});
    },
  });
  managerRef = manager;

  const stdio = new StdioServerTransport();
  stdio.onclose = () => {
    void manager.handleStdioClosed().then((verdict) => {
      if (verdict === "exit") process.exit(0);
      console.error("[shim] stdio closed; lingering to serve attached agents.");
    });
  };
  await shimServer.connect(stdio);
  await manager.start();
  console.error(
    manager.isHosting()
      ? "PluginOS session layer running on stdio (hosting daemon)"
      : "PluginOS session layer running on stdio (attached to daemon)"
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

Note on stdio-close wiring: `Server.connect` assigns its own `onclose` handler to the transport, so a handler set on `stdio.onclose` before `connect` gets overwritten. Wire it via the server instead — after `connect`, set `shimServer.onclose` (the SDK `Server` exposes an `onclose` callback invoked when its transport closes). The `stdio.onclose` line in the body above must be replaced by this final form:

```typescript
  await shimServer.connect(stdio);
  shimServer.onclose = () => {
    void manager.handleStdioClosed().then((verdict) => {
      if (verdict === "exit") process.exit(0);
      console.error("[shim] stdio closed; lingering to serve attached agents.");
    });
  };
  await manager.start();
```

- [ ] **Step 6: Typecheck, lint, full unit suite**

Run: `npm run typecheck && npm run lint && npm test -w packages/mcp-server`
Expected: PASS across the board.

- [ ] **Step 7: Commit**

Invoke Skill(commit) — message intent: `feat(mcp-server): session-layer main with attach/promote link manager`

---

### Task 12: Multi-process integration test

**Files:**
- Create: `packages/mcp-server/src/__tests__/multi-session.integration.test.ts`

**Interfaces:**
- Consumes: the real `src/index.ts` entry, spawned per session via the SDK's `StdioClientTransport` (which owns the child process), `PLUGINOS_STATE_DIR` + `PLUGINOS_PORT_RANGE`.
- Produces: end-to-end proof of B1's contract.

- [ ] **Step 1: Write the test**

```typescript
// packages/mcp-server/src/__tests__/multi-session.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "index.ts");

describe("multi-session integration", () => {
  let dir: string;
  const clients: Client[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-multi-"));
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) {
      await c.close().catch(() => {});
    }
    await rm(dir, { recursive: true, force: true });
  });

  async function spawnSession(): Promise<Client> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", entry],
      env: {
        ...process.env,
        PLUGINOS_STATE_DIR: dir,
        PLUGINOS_PORT_RANGE: "9730-9733",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "it", version: "1.0.0" });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  async function agentCount(client: Client): Promise<number> {
    const res = (await client.callTool({ name: "get_status", arguments: {} })) as {
      content: Array<{ text: string }>;
    };
    return JSON.parse(res.content[0].text).attachedAgents as number;
  }

  it("two sessions share one daemon; the second attaches instead of reaping", async () => {
    const a = await spawnSession();
    const toolsA = await a.listTools();
    expect(toolsA.tools.map((t) => t.name)).toContain("run_operation");
    expect(await agentCount(a)).toBe(1);

    const b = await spawnSession();
    const toolsB = await b.listTools();
    expect(toolsB.tools.length).toBe(toolsA.tools.length);
    expect(await agentCount(b)).toBe(2);

    // Session A must still be alive — the old behavior would have reaped it.
    expect(await agentCount(a)).toBe(2);
  }, 30_000);

  it("a surviving session promotes to daemon when the host session dies", async () => {
    const a = await spawnSession();
    await a.listTools();
    const b = await spawnSession();
    expect(await agentCount(b)).toBe(2);

    // Kill A (the daemon host). close() terminates the child process.
    await clients.splice(clients.indexOf(a), 1)[0].close();

    // B re-links (promotes) in the background; keep calling until it answers.
    let recovered = 0;
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      try {
        recovered = await agentCount(b);
        if (recovered === 1) break;
      } catch {
        // between daemons — expected transiently
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(recovered).toBe(1);
    const tools = await b.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("run_operation");
  }, 40_000);
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -w packages/mcp-server -- multi-session.integration`
Expected: PASS (2 tests). If the promote test flakes on timing, raise the polling deadline before weakening assertions — the contract is "B answers with attachedAgents 1 after A dies".

- [ ] **Step 3: Run the entire repo pipeline**

Run: `npm run check` (from repo root; runs lint → format → build:shared → typecheck → build → test)
Expected: PASS. Fix anything it flags before committing.

- [ ] **Step 4: Commit**

Invoke Skill(commit) — message intent: `test(mcp-server): multi-session share, attach, and promote integration coverage`

---

### Task 13: Docs, changelog, version bump 0.7.0

**Files:**
- Modify: `.claude/rules/architecture.md` (this repo's copy)
- Modify: `packages/mcp-server/CHANGELOG.md` if present, else root `CHANGELOG.md` (check: `find . -name CHANGELOG.md -not -path "*/node_modules/*"`; also `packages/claude-plugin/CHANGELOG.md` exists — update only files that already track mcp-server changes)
- Version bump: all manifests via lockstep script

- [ ] **Step 1: Update `.claude/rules/architecture.md`**

Replace the Data Flow diagram block with:

```
Agent A ──[MCP stdio]──→ pluginos (session layer, hosts daemon role)
Agent B ──[MCP stdio]──→ pluginos (session layer) ──[WS /agent]──┐
                                                                 ▼
                                     daemon role: WS + HTTP (one port, 9500-9510)
                                        │                    │
                                        │ WebSocket (path /) │ HTTP: /ui.html, /state.json
                                        ▼                    ▼
                              Figma Bridge Plugin      Bootloader UI fetch
```

And add to Key Patterns (keep every existing entry — never remove content):

```markdown
**Multi-Session Daemon** (`mcp-server/src/daemon.ts`, `src/shim/`): every `pluginos` process is a stdio session layer; at most one hosts the daemon role (bridge + HTTP + `/agent`). Equal-version processes attach instead of reaping; the daemon exits 30s after its last agent detaches (`state.json.parentAlive` now means "has clients"). Crash of the host promotes a surviving session via the singleton lock.
```

Check for other copies that must stay in sync: `grep -rln "Version Handshake" --include="*.md" .` and update each hit that contains the architecture text.

- [ ] **Step 2: Add CHANGELOG entries**

Follow each CHANGELOG's existing format; content: multi-session daemon (B1) — concurrent agent sessions share one daemon over `/agent`; sessions no longer kill each other's servers; `get_status` reports `attachedAgents`; `PLUGINOS_PORT_RANGE` env for tests.

- [ ] **Step 3: Bump versions in lockstep**

```bash
cd "<repo-root>" && npm version minor -w packages/mcp-server && node scripts/bump-lockstep.cjs
```

Expected: mcp-server at 0.7.0; lockstep propagates to all package.json manifests, DXT manifest, plugin.json. Verify: `node scripts/check-version-lockstep.cjs` (or whatever CI invokes — see `.github/workflows`).

Note: 0.6→0.7 is a breaking bump under the 0.x convention — the Figma plugin will show its mismatch UI against 0.6 plugins, which is intended (plugin must be updated together).

- [ ] **Step 4: Full pipeline + commit**

Run: `npm run check`
Expected: PASS, including the claude-plugin ops-reference drift check (should be clean — no operations changed) and skill token budget.

Invoke Skill(commit) — message intent: `chore(release): multi-session daemon B1, bump lockstep to 0.7.0`

- [ ] **Step 5: Manual smoke checklist (record results in the PR description)**

1. Two real Claude Code sessions with the PluginOS plugin: both run `get_status`; neither shows "Server disconnected" when the other starts. `attachedAgents` reads 2.
2. With the Figma plugin open: run an op from each session; plugin activity log shows both; pill stays green throughout.
3. Close the daemon-hosting session's terminal: within ~35 s the surviving session still answers (`attachedAgents: 1` after promotion); Figma plugin reconnects via its existing backoff.
4. `kill -9` the daemon process directly: surviving session recovers the same way.
5. Single session start/stop: `~/.pluginos/state.json` and `server.pid` are removed within the 30 s grace after the session ends (no orphans).

---

## Self-Review Log (kept per writing-plans skill)

- **Spec coverage:** `/agent` + handshake (T1, T8), per-agent McpServer + pending ownership (T8), attachedAgents/hasClients (T4, T5, T9), shim session layer (T10, T11), election attach/bind + bind-race guard (T5, T7, T9, T11), lifetime/orphans (T6, T9), bootloader/plugin untouched (no bridge-plugin file appears in any task), degraded mode (unwritable state dir → `acquireSingletonLock` already degrades; `decideRole` returns bind; unchanged behavior). Deferred to B2 per spec: semver policy, DEMOTE, version-override hook, `_hint`, `sessionLabel` UI.
- **Deviation, documented in header:** basic crash promotion ships in B1 (same code path as first-boot bind); B2 keeps handover + semver + refinements.
- **Type consistency check:** `DaemonHandle` includes `bridge` (introduced T9 Step 3 note, consumed by T11 fake); `createShimServer(waitForLink, shimVersion)` consistent T10/T11; `LinkManagerDeps.startDaemon` return type matches `runDaemon`'s; `getCount()` naming consistent (`AgentEndpoint.getCount`, `hostedAgentCount`).
- **Port allocation for tests (no collisions with each other or real daemons):** router 9711, endpoint 9712, link 9713, daemon 9720-9722, integration 9730-9733; existing suites use 9537-9612.
