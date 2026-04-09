# PluginOS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PluginOS — an MCP server + Figma bridge plugin that lets any LLM agent execute Figma plugin operations at ~230 tokens per call instead of ~8,000-28,000.

**Architecture:** Hybrid dual-mode system. The MCP server is a thin router exposing 4 tools (`list_operations`, `run_operation`, `execute_figma`, `get_status`). The Figma bridge plugin stores and executes all pre-built operations locally, communicating via WebSocket. The MCP server sends only command names + params (~100 bytes); the plugin does all heavy lifting.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `ws` (WebSocket), Figma Plugin API, webpack (plugin bundling), vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-09-pluginos-design.md`

---

## Chunk 1: Project Scaffolding & Shared Types

### Task 1: Initialize monorepo structure

**Files:**
- Create: `package.json` (workspace root)
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/bridge-plugin/package.json`
- Create: `packages/bridge-plugin/tsconfig.json`
- Create: `packages/bridge-plugin/manifest.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create workspace root**

```json
// package.json
{
  "name": "pluginos",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "dev:server": "npm run dev -w packages/mcp-server",
    "dev:plugin": "npm run dev -w packages/bridge-plugin"
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 2: Create shared package with types**

```json
// packages/shared/package.json
{
  "name": "@pluginos/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  }
}
```

```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create MCP server package skeleton**

```json
// packages/mcp-server/package.json
{
  "name": "pluginos",
  "version": "0.1.0",
  "description": "Agent-native Figma operations platform — MCP server",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "pluginos": "./bin/pluginos.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "ws": "^8.18.0",
    "@pluginos/shared": "*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0",
    "@types/ws": "^8.5.0"
  }
}
```

```json
// packages/mcp-server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 4: Create bridge plugin package skeleton**

```json
// packages/bridge-plugin/package.json
{
  "name": "@pluginos/bridge-plugin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "test": "vitest run"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.100.0",
    "typescript": "^5.5.0",
    "webpack": "^5.90.0",
    "webpack-cli": "^5.1.0",
    "ts-loader": "^9.5.0",
    "html-webpack-plugin": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

```json
// packages/bridge-plugin/manifest.json
{
  "name": "PluginOS Bridge",
  "id": "pluginos-bridge",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": [
      "ws://localhost:9500",
      "ws://localhost:9501",
      "ws://localhost:9502",
      "ws://localhost:9503",
      "ws://localhost:9504",
      "ws://localhost:9505",
      "ws://localhost:9506",
      "ws://localhost:9507",
      "ws://localhost:9508",
      "ws://localhost:9509",
      "ws://localhost:9510"
    ]
  },
  "permissions": ["teamlibrary"]
}
```

```json
// packages/bridge-plugin/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "typeRoots": ["node_modules/@figma"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Install dependencies and verify build**

```bash
npm install
npm run build -w packages/shared
```
Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git init
echo "node_modules/\ndist/\n*.js.map" > .gitignore
git add .
git commit -m "chore: scaffold PluginOS monorepo with shared, mcp-server, and bridge-plugin packages"
```

---

### Task 2: Define shared types and protocol

**Files:**
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/categories.ts`
- Test: `packages/shared/src/__tests__/protocol.test.ts`

- [ ] **Step 1: Write the test for protocol message validation**

```typescript
// packages/shared/src/__tests__/protocol.test.ts
import { describe, it, expect } from "vitest";
import {
  createRunOperationMessage,
  createExecuteMessage,
  createResultMessage,
  createStatusMessage,
  parseMessage,
} from "../protocol";

describe("protocol", () => {
  it("creates a run_operation message with unique id", () => {
    const msg = createRunOperationMessage("lint_styles", { scope: "page" });
    expect(msg.id).toMatch(/^req_/);
    expect(msg.type).toBe("run_operation");
    expect(msg.operation).toBe("lint_styles");
    expect(msg.params).toEqual({ scope: "page" });
  });

  it("creates an execute message", () => {
    const msg = createExecuteMessage("return 42", 5000);
    expect(msg.type).toBe("execute");
    expect(msg.code).toBe("return 42");
    expect(msg.timeout).toBe(5000);
  });

  it("creates a success result message", () => {
    const msg = createResultMessage("req_123", true, { count: 5 });
    expect(msg.id).toBe("req_123");
    expect(msg.type).toBe("result");
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ count: 5 });
  });

  it("creates an error result message", () => {
    const msg = createResultMessage("req_123", false, undefined, "Font not loaded");
    expect(msg.success).toBe(false);
    expect(msg.error).toBe("Font not loaded");
  });

  it("creates a status message", () => {
    const msg = createStatusMessage("abc123", "My File", "Page 1");
    expect(msg.type).toBe("status");
    expect(msg.fileKey).toBe("abc123");
  });

  it("parses a valid JSON message", () => {
    const raw = JSON.stringify({ id: "req_1", type: "result", success: true, result: {} });
    const parsed = parseMessage(raw);
    expect(parsed.type).toBe("result");
  });

  it("returns null for invalid JSON", () => {
    expect(parseMessage("not json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && npx vitest run
```
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement types**

```typescript
// packages/shared/src/types.ts

export type OperationCategory =
  | "lint"
  | "accessibility"
  | "components"
  | "tokens"
  | "layout"
  | "content"
  | "export"
  | "assets"
  | "annotations"
  | "colors"
  | "typography"
  | "cleanup"
  | "data"
  | "custom";

export interface ParamDef {
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  description: string;
  default?: string | number | boolean | string[];
}

export interface OperationManifest {
  name: string;
  description: string;
  category: OperationCategory;
  params: Record<string, ParamDef>;
  returns: string;
}

export interface OperationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration_ms?: number;
}
```

- [ ] **Step 4: Implement protocol**

```typescript
// packages/shared/src/protocol.ts

// --- Message types: MCP Server → Plugin ---

export interface RunOperationMessage {
  id: string;
  type: "run_operation";
  operation: string;
  params: Record<string, unknown>;
}

export interface ExecuteMessage {
  id: string;
  type: "execute";
  code: string;
  timeout: number;
}

// --- Message types: Plugin → MCP Server ---

export interface ResultMessage {
  id: string;
  type: "result";
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface StatusMessage {
  type: "status";
  fileKey: string;
  fileName: string;
  currentPage: string;
}

export type ServerToPluginMessage = RunOperationMessage | ExecuteMessage;
export type PluginToServerMessage = ResultMessage | StatusMessage;
export type ProtocolMessage = ServerToPluginMessage | PluginToServerMessage;

// --- Factories ---

let counter = 0;

export function createRunOperationMessage(
  operation: string,
  params: Record<string, unknown>
): RunOperationMessage {
  return {
    id: `req_${++counter}_${Date.now()}`,
    type: "run_operation",
    operation,
    params,
  };
}

export function createExecuteMessage(
  code: string,
  timeout: number = 5000
): ExecuteMessage {
  return {
    id: `req_${++counter}_${Date.now()}`,
    type: "execute",
    code,
    timeout,
  };
}

export function createResultMessage(
  id: string,
  success: boolean,
  result?: unknown,
  error?: string
): ResultMessage {
  return { id, type: "result", success, result, error };
}

export function createStatusMessage(
  fileKey: string,
  fileName: string,
  currentPage: string
): StatusMessage {
  return { type: "status", fileKey, fileName, currentPage };
}

export function parseMessage(raw: string): ProtocolMessage | null {
  try {
    return JSON.parse(raw) as ProtocolMessage;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement categories**

```typescript
// packages/shared/src/categories.ts
import { OperationCategory } from "./types";

export const CATEGORY_DESCRIPTIONS: Record<OperationCategory, string> = {
  lint: "Linting & quality — style consistency, naming conventions, detached instances",
  accessibility: "Accessibility — contrast ratios, touch targets, WCAG compliance, color blindness",
  components: "Component management — find instances, swap, detach, override analysis",
  tokens: "Design tokens & styles — variable export, style audit, token usage",
  layout: "Layout & spacing — auto-layout audit, spacing consistency, fixed values",
  content: "Content population — lorem ipsum, data population, copy management",
  export: "Export & code — CSS extraction, SVG optimization, HTML structure",
  assets: "Asset insertion — icons, placeholder images, illustrations",
  annotations: "Annotations & docs — measurements, redlines, spacing annotations",
  colors: "Color management — palette extraction, generation, non-style color detection",
  typography: "Typography — text style audit, missing fonts, type scale generation",
  cleanup: "Cleanup & organization — remove hidden, rename, round values, dedup",
  data: "Data visualization — charts, tables, JSON population",
  custom: "Custom operations — user-defined via execute_figma fallback",
};
```

- [ ] **Step 6: Create index barrel**

```typescript
// packages/shared/src/index.ts
export * from "./types";
export * from "./protocol";
export * from "./categories";
```

- [ ] **Step 7: Run tests**

```bash
cd packages/shared && npx vitest run
```
Expected: All 7 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared types, protocol messages, and operation categories"
```

---

## Chunk 2: MCP Server — Core

### Task 3: WebSocket server with connection management

**Files:**
- Create: `packages/mcp-server/src/websocket.ts`
- Create: `packages/mcp-server/src/connection-manager.ts`
- Test: `packages/mcp-server/src/__tests__/websocket.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/mcp-server/src/__tests__/websocket.test.ts
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { PluginOSWebSocketServer } from "../websocket";

describe("PluginOSWebSocketServer", () => {
  let server: PluginOSWebSocketServer;

  afterEach(async () => {
    if (server) await server.close();
  });

  it("starts on the specified port", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9550, 9550] });
    const port = await server.start();
    expect(port).toBe(9550);
  });

  it("accepts a WebSocket connection", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9551, 9551] });
    await server.start();

    const client = new WebSocket("ws://localhost:9551");
    await new Promise<void>((resolve) => client.on("open", resolve));
    expect(server.isConnected()).toBe(true);
    client.close();
  });

  it("sends a message and receives a response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9552, 9552] });
    await server.start();

    const client = new WebSocket("ws://localhost:9552");
    await new Promise<void>((resolve) => client.on("open", resolve));

    // Echo server simulation: client echoes back with result
    client.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      client.send(JSON.stringify({
        id: msg.id,
        type: "result",
        success: true,
        result: { echoed: true },
      }));
    });

    const result = await server.sendAndWait({
      id: "test_1",
      type: "run_operation",
      operation: "test",
      params: {},
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ echoed: true });
    client.close();
  });

  it("times out if no response", async () => {
    server = new PluginOSWebSocketServer({ portRange: [9553, 9553] });
    await server.start();

    const client = new WebSocket("ws://localhost:9553");
    await new Promise<void>((resolve) => client.on("open", resolve));
    // Client does NOT respond

    await expect(
      server.sendAndWait(
        { id: "test_2", type: "execute", code: "return 1", timeout: 500 },
        500
      )
    ).rejects.toThrow(/timeout/i);
    client.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mcp-server && npx vitest run
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement WebSocket server**

```typescript
// packages/mcp-server/src/websocket.ts
import { WebSocketServer, WebSocket } from "ws";
import {
  ServerToPluginMessage,
  ResultMessage,
  StatusMessage,
  parseMessage,
} from "@pluginos/shared";

interface WebSocketServerOptions {
  portRange: [number, number];
}

export class PluginOSWebSocketServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port: number | null = null;
  private pending = new Map<string, {
    resolve: (result: ResultMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private fileKey: string | null = null;
  private fileName: string | null = null;
  private currentPage: string | null = null;
  private options: WebSocketServerOptions;

  constructor(options?: Partial<WebSocketServerOptions>) {
    this.options = {
      portRange: options?.portRange ?? [9500, 9510],
    };
  }

  async start(): Promise<number> {
    const [min, max] = this.options.portRange;
    for (let port = min; port <= max; port++) {
      try {
        await this.tryPort(port);
        this.port = port;
        return port;
      } catch {
        continue;
      }
    }
    throw new Error(`No available port in range ${min}-${max}`);
  }

  private tryPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port,
        verifyClient: (info, cb) => {
          const origin = info.origin;
          const allowed =
            !origin ||
            origin === "null" ||
            origin.startsWith("https://www.figma.com") ||
            origin.startsWith("https://figma.com");
          cb(allowed);
        },
      });
      wss.on("listening", () => {
        this.wss = wss;
        this.setupServer();
        resolve();
      });
      wss.on("error", reject);
    });
  }

  private setupServer(): void {
    this.wss!.on("connection", (ws) => {
      this.client = ws;

      ws.on("message", (data) => {
        const msg = parseMessage(data.toString());
        if (!msg) return;

        if (msg.type === "result") {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            pending.resolve(msg as ResultMessage);
          }
        } else if (msg.type === "status") {
          const status = msg as StatusMessage;
          this.fileKey = status.fileKey;
          this.fileName = status.fileName;
          this.currentPage = status.currentPage;
        }
      });

      ws.on("close", () => {
        this.client = null;
        this.fileKey = null;
        this.fileName = null;
        // Reject all pending requests
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Plugin disconnected"));
          this.pending.delete(id);
        }
      });
    });
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      fileKey: this.fileKey,
      fileName: this.fileName,
      currentPage: this.currentPage,
      port: this.port,
    };
  }

  sendAndWait(
    message: ServerToPluginMessage,
    timeout: number = 30000
  ): Promise<ResultMessage> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error("Plugin not connected. Open PluginOS Bridge in Figma."));
        return;
      }

      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(message.id, { resolve, reject, timer });
      this.client!.send(JSON.stringify(message));
    });
  }

  async close(): Promise<void> {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server closing"));
    }
    this.pending.clear();
    this.client?.close();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/mcp-server && npx vitest run
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat: add WebSocket server with connection management and request correlation"
```

---

### Task 4: MCP server with tool definitions

**Files:**
- Create: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/bin/pluginos.js`

- [ ] **Step 1: Implement MCP server**

```typescript
// packages/mcp-server/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createRunOperationMessage,
  createExecuteMessage,
  CATEGORY_DESCRIPTIONS,
  OperationCategory,
  OperationManifest,
} from "@pluginos/shared";
import { PluginOSWebSocketServer } from "./websocket";

export function createPluginOSServer(wsServer: PluginOSWebSocketServer) {
  const server = new McpServer({
    name: "pluginos",
    version: "0.1.0",
  });

  // Tool: list_operations
  server.tool(
    "list_operations",
    "List all available Figma operations, optionally filtered by category. " +
    "Categories: " + Object.keys(CATEGORY_DESCRIPTIONS).join(", "),
    {
      category: z.string().optional().describe(
        "Filter by category. Options: " + Object.keys(CATEGORY_DESCRIPTIONS).join(", ")
      ),
    },
    async ({ category }) => {
      // Ask the plugin for its operation manifests
      const msg = createRunOperationMessage("__list_operations", {
        category: category || null,
      });

      try {
        const result = await wsServer.sendAndWait(msg, 5000);
        if (result.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: run_operation
  server.tool(
    "run_operation",
    "Execute a pre-built Figma operation by name. Use list_operations to discover available operations. " +
    "Operations run inside the Figma plugin with full Plugin API access. " +
    "Results are structured and summarized — no raw node data.",
    {
      name: z.string().describe("Operation name (e.g., 'lint_styles', 'check_contrast')"),
      params: z.record(z.unknown()).optional().default({}).describe("Operation parameters"),
    },
    async ({ name, params }) => {
      const msg = createRunOperationMessage(name, params);

      try {
        const result = await wsServer.sendAndWait(msg, 30000);
        if (result.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Operation '${name}' failed: ${result.error}` }],
          isError: true,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: execute_figma
  server.tool(
    "execute_figma",
    "Execute arbitrary Figma Plugin API JavaScript code in the plugin sandbox. " +
    "Use this as a fallback when no pre-built operation covers your need. " +
    "The code runs in an async context with full access to the `figma` global. " +
    "Return data via `return` statement. Max timeout 30 seconds.",
    {
      code: z.string().describe("JavaScript code to execute in Figma's Plugin API context"),
      timeout: z.number().optional().default(5000).describe("Timeout in ms (max 30000)"),
    },
    async ({ code, timeout }) => {
      const safeTimeout = Math.min(timeout, 30000);
      const msg = createExecuteMessage(code, safeTimeout);

      try {
        const result = await wsServer.sendAndWait(msg, safeTimeout + 2000);
        if (result.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Execution failed: ${result.error}` }],
          isError: true,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: get_status
  server.tool(
    "get_status",
    "Check if the PluginOS Bridge plugin is connected and which Figma file is active.",
    {},
    async () => {
      const status = wsServer.getStatus();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(status, null, 2),
        }],
      };
    }
  );

  return server;
}
```

- [ ] **Step 2: Create entry point**

```typescript
// packages/mcp-server/src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PluginOSWebSocketServer } from "./websocket";
import { createPluginOSServer } from "./server";

export { createPluginOSServer } from "./server";
export { PluginOSWebSocketServer } from "./websocket";

async function main() {
  const wsServer = new PluginOSWebSocketServer();
  const port = await wsServer.start();
  console.error(`PluginOS WebSocket server listening on port ${port}`);

  const mcpServer = createPluginOSServer(wsServer);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Create CLI entry point**

```javascript
#!/usr/bin/env node
// packages/mcp-server/bin/pluginos.js
import "../dist/index.js";
```

- [ ] **Step 4: Build and verify**

```bash
cd packages/shared && npm run build
cd ../mcp-server && npm run build
```
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat: add MCP server with list_operations, run_operation, execute_figma, and get_status tools"
```

---

## Chunk 3: Bridge Plugin — Core

### Task 5: Plugin UI with WebSocket client

**Files:**
- Create: `packages/bridge-plugin/src/ui.html`
- Create: `packages/bridge-plugin/webpack.config.js`

- [ ] **Step 1: Create webpack config**

```javascript
// packages/bridge-plugin/webpack.config.js
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => [
  // Plugin code (sandbox)
  {
    entry: "./src/code.ts",
    output: {
      filename: "code.js",
      path: path.resolve(__dirname, "dist"),
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    mode: argv.mode || "production",
  },
  // Plugin UI (iframe)
  {
    entry: "./src/ui-entry.ts",
    output: {
      filename: "ui-bundle.js",
      path: path.resolve(__dirname, "dist"),
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/ui.html",
        filename: "ui.html",
        inject: "body",
        inlineSource: ".(js|css)$",
      }),
    ],
    mode: argv.mode || "production",
  },
];
```

- [ ] **Step 2: Create UI HTML with WebSocket client**

```html
<!-- packages/bridge-plugin/src/ui.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Inter, system-ui, sans-serif;
      font-size: 12px;
      margin: 8px;
      color: var(--figma-color-text, #333);
      background: var(--figma-color-bg, #fff);
    }
    .status { display: flex; align-items: center; gap: 6px; }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #e74c3c;
    }
    .dot.connected { background: #2ecc71; }
    .info { margin-top: 8px; color: var(--figma-color-text-secondary, #888); }
  </style>
</head>
<body>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="status-text">Connecting...</span>
  </div>
  <div class="info" id="info"></div>
</body>
</html>
```

- [ ] **Step 3: Create UI entry (WebSocket client logic)**

```typescript
// packages/bridge-plugin/src/ui-entry.ts

const PORT_MIN = 9500;
const PORT_MAX = 9510;
const RECONNECT_DELAY = 3000;

let ws: WebSocket | null = null;
let currentPort: number | null = null;

function updateStatus(connected: boolean, text: string) {
  const dot = document.getElementById("dot")!;
  const statusText = document.getElementById("status-text")!;
  dot.className = connected ? "dot connected" : "dot";
  statusText.textContent = text;
}

function updateInfo(text: string) {
  document.getElementById("info")!.textContent = text;
}

// Forward messages from code.js (plugin sandbox) to WebSocket
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "ws-send" && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg.payload));
  }
};

async function findAndConnect(): Promise<void> {
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    try {
      await tryConnect(port);
      return;
    } catch {
      continue;
    }
  }
  updateStatus(false, "No MCP server found");
  updateInfo(`Scanned ports ${PORT_MIN}-${PORT_MAX}. Run 'npx pluginos' to start.`);
  setTimeout(findAndConnect, RECONNECT_DELAY);
}

function tryConnect(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("timeout"));
    }, 2000);

    socket.onopen = () => {
      clearTimeout(timeout);
      ws = socket;
      currentPort = port;
      updateStatus(true, `Connected (port ${port})`);
      updateInfo("Ready for operations");

      // Tell code.js we're connected
      parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");

      resolve();
    };

    socket.onmessage = (event) => {
      // Forward WebSocket messages to code.js
      try {
        const data = JSON.parse(event.data);
        parent.postMessage({ pluginMessage: { type: "ws-message", payload: data } }, "*");
      } catch { /* ignore malformed */ }
    };

    socket.onclose = () => {
      if (ws === socket) {
        ws = null;
        updateStatus(false, "Disconnected");
        parent.postMessage({ pluginMessage: { type: "ws-disconnected" } }, "*");
        setTimeout(findAndConnect, RECONNECT_DELAY);
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error("connection failed"));
    };
  });
}

// Start scanning for MCP server
findAndConnect();
```

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add bridge plugin UI with WebSocket client and port scanning"
```

---

### Task 6: Plugin sandbox code with operation router

**Files:**
- Create: `packages/bridge-plugin/src/code.ts`
- Create: `packages/bridge-plugin/src/operations/index.ts`
- Create: `packages/bridge-plugin/src/utils/serializer.ts`

- [ ] **Step 1: Implement result serializer**

```typescript
// packages/bridge-plugin/src/utils/serializer.ts

// Safe serialization that handles Figma node circular references,
// symbols (figma.mixed), and oversized results
export function safeSerialize(value: unknown, maxDepth = 5): unknown {
  const seen = new WeakSet();

  function walk(val: unknown, depth: number): unknown {
    if (depth > maxDepth) return "[max depth]";
    if (val === null || val === undefined) return val;
    if (typeof val === "symbol") return val.toString();
    if (typeof val === "function") return "[function]";
    if (typeof val !== "object") return val;

    if (seen.has(val as object)) return "[circular]";
    seen.add(val as object);

    if (Array.isArray(val)) {
      // Cap arrays at 200 items for safety
      const capped = val.slice(0, 200);
      const result = capped.map((item) => walk(item, depth + 1));
      if (val.length > 200) {
        result.push(`[...${val.length - 200} more items]`);
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(val as Record<string, unknown>)) {
      result[key] = walk((val as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }

  return walk(value, 0);
}
```

- [ ] **Step 2: Create operation registry (empty for now)**

```typescript
// packages/bridge-plugin/src/operations/index.ts

export interface OperationHandler {
  manifest: {
    name: string;
    description: string;
    category: string;
    params: Record<string, { type: string; required: boolean; description: string }>;
    returns: string;
  };
  execute: (params: Record<string, any>) => Promise<any>;
}

// Registry of all built-in operations
const operations = new Map<string, OperationHandler>();

export function registerOperation(handler: OperationHandler): void {
  operations.set(handler.manifest.name, handler);
}

export function getOperation(name: string): OperationHandler | undefined {
  return operations.get(name);
}

export function listOperations(category?: string): OperationHandler["manifest"][] {
  const all = Array.from(operations.values()).map((op) => op.manifest);
  if (category) return all.filter((op) => op.category === category);
  return all;
}

// Import and register all operation modules here.
// (Operations will be added in Task 8+)
```

- [ ] **Step 3: Implement plugin sandbox code**

```typescript
// packages/bridge-plugin/src/code.ts

import { getOperation, listOperations } from "./operations/index";
import { safeSerialize } from "./utils/serializer";

// Show the UI (which handles WebSocket)
figma.showUI(__html__, { width: 200, height: 60, visible: true });

// Send file status to MCP server on connection
function sendFileStatus(): void {
  const fileKey = figma.fileKey;
  const fileName = figma.root.name;
  const currentPage = figma.currentPage.name;

  figma.ui.postMessage({
    type: "ws-send",
    payload: {
      type: "status",
      fileKey: fileKey || "unknown",
      fileName,
      currentPage,
    },
  });
}

// Handle messages from the UI (which come from the WebSocket)
figma.ui.onmessage = async (msg) => {
  if (msg.type === "ws-connected") {
    sendFileStatus();
    return;
  }

  if (msg.type === "ws-disconnected") {
    return;
  }

  if (msg.type === "ws-message") {
    const data = msg.payload;
    await handleServerMessage(data);
  }
};

async function handleServerMessage(msg: any): Promise<void> {
  const { id, type } = msg;

  try {
    if (type === "run_operation") {
      const { operation, params } = msg;

      // Special internal operation: list all operations
      if (operation === "__list_operations") {
        const manifests = listOperations(params?.category || undefined);
        sendResult(id, true, manifests);
        return;
      }

      const handler = getOperation(operation);
      if (!handler) {
        sendResult(id, false, undefined, `Unknown operation: '${operation}'`);
        return;
      }

      const startTime = Date.now();
      const result = await handler.execute(params || {});
      const duration = Date.now() - startTime;
      sendResult(id, true, { ...safeSerialize(result), _duration_ms: duration });
    } else if (type === "execute") {
      const { code, timeout } = msg;
      const wrappedCode = `(async function() {\n${code}\n})()`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeout}ms`)), timeout)
      );

      // eval in the plugin sandbox has full figma.* access
      const codePromise = eval(wrappedCode);
      const result = await Promise.race([codePromise, timeoutPromise]);
      sendResult(id, true, safeSerialize(result));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendResult(id, false, undefined, errorMessage);
  }
}

function sendResult(id: string, success: boolean, result?: unknown, error?: string): void {
  figma.ui.postMessage({
    type: "ws-send",
    payload: { id, type: "result", success, result, error },
  });
}

// Update status when page changes
figma.on("currentpagechange", sendFileStatus);
```

- [ ] **Step 4: Build plugin**

```bash
cd packages/bridge-plugin && npm run build
```
Expected: `dist/code.js` and `dist/ui.html` produced. No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add bridge plugin sandbox with operation router and execute_figma support"
```

---

## Chunk 4: Phase 1 Operations (MVP)

### Task 7: Lint operations

**Files:**
- Create: `packages/bridge-plugin/src/operations/lint.ts`
- Modify: `packages/bridge-plugin/src/operations/index.ts` — import and register lint ops

- [ ] **Step 1: Implement lint operations**

```typescript
// packages/bridge-plugin/src/operations/lint.ts
import { registerOperation } from "./index";

// --- lint_styles ---
registerOperation({
  manifest: {
    name: "lint_styles",
    description: "Find layers using local styles instead of library styles, or no style at all. Reports fills, strokes, text styles, and effects that don't reference a shared style.",
    category: "lint",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ total_nodes: number, issues: Array<{nodeId, nodeName, nodeType, issue}>, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const issues: Array<{ nodeId: string; nodeName: string; nodeType: string; issue: string }> = [];

    for (const node of nodes) {
      // Check fill styles
      if ("fillStyleId" in node) {
        const fillStyleId = (node as any).fillStyleId;
        if (fillStyleId === "" && "fills" in node) {
          const fills = (node as any).fills;
          if (Array.isArray(fills) && fills.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Fill without style",
            });
          }
        }
      }

      // Check stroke styles
      if ("strokeStyleId" in node) {
        const strokeStyleId = (node as any).strokeStyleId;
        if (strokeStyleId === "" && "strokes" in node) {
          const strokes = (node as any).strokes;
          if (Array.isArray(strokes) && strokes.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Stroke without style",
            });
          }
        }
      }

      // Check text styles
      if (node.type === "TEXT") {
        const textNode = node as TextNode;
        if (textNode.textStyleId === "" || textNode.textStyleId === figma.mixed) {
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            issue: "Text without style",
          });
        }
      }

      // Check effect styles
      if ("effectStyleId" in node) {
        const effectStyleId = (node as any).effectStyleId;
        if (effectStyleId === "" && "effects" in node) {
          const effects = (node as any).effects;
          if (Array.isArray(effects) && effects.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Effect without style",
            });
          }
        }
      }
    }

    return {
      total_nodes: nodes.length,
      issues: issues.slice(0, 200),
      total_issues: issues.length,
      summary: `Scanned ${nodes.length} nodes. Found ${issues.length} style issues.`,
    };
  },
});

// --- lint_detached ---
registerOperation({
  manifest: {
    name: "lint_detached",
    description: "Find all detached component instances — frames that were once instances but have been detached.",
    category: "lint",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ detached: Array<{nodeId, nodeName, parentName}>, count: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const detached: Array<{ nodeId: string; nodeName: string; parentName: string }> = [];

    for (const node of nodes) {
      if (node.type === "FRAME") {
        // Heuristic: frames with names like "ComponentName" that aren't instances
        // Check if the frame has sharedPluginData indicating it was once a component
        // Or check naming patterns like "Button", "Card", etc.
        // Most reliable: check if parent has instances nearby with matching structure
        const pluginData = node.getSharedPluginData("pluginos", "was_instance");
        if (pluginData === "true") {
          detached.push({
            nodeId: node.id,
            nodeName: node.name,
            parentName: node.parent?.name || "root",
          });
        }
      }
    }

    return {
      detached: detached.slice(0, 200),
      count: detached.length,
      summary: `Found ${detached.length} detached instances on ${scope}.`,
    };
  },
});

// --- lint_naming ---
registerOperation({
  manifest: {
    name: "lint_naming",
    description: "Find layers with default names like 'Frame 1', 'Rectangle 2', 'Group 3' that should be renamed for clarity.",
    category: "lint",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ unnamed: Array<{nodeId, nodeName, nodeType}>, count: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const defaultNamePattern = /^(Frame|Rectangle|Ellipse|Group|Line|Vector|Text|Polygon|Star|Section|Slice|Image|Component|Instance) \d+$/;
    const unnamed: Array<{ nodeId: string; nodeName: string; nodeType: string }> = [];

    for (const node of nodes) {
      if (defaultNamePattern.test(node.name)) {
        unnamed.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
        });
      }
    }

    return {
      unnamed: unnamed.slice(0, 200),
      count: unnamed.length,
      summary: `Found ${unnamed.length} layers with default names.`,
    };
  },
});
```

- [ ] **Step 2: Register lint operations in index**

Add to `packages/bridge-plugin/src/operations/index.ts`:
```typescript
// At the bottom of the file:
import "./lint";
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/bridge-plugin && npm run build
```
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add lint operations — lint_styles, lint_detached, lint_naming"
```

---

### Task 8: Accessibility operations

**Files:**
- Create: `packages/bridge-plugin/src/operations/accessibility.ts`
- Modify: `packages/bridge-plugin/src/operations/index.ts` — add import

- [ ] **Step 1: Implement accessibility operations**

```typescript
// packages/bridge-plugin/src/operations/accessibility.ts
import { registerOperation } from "./index";

// Helper: extract computed RGBA from a paint array against a background
function computeColor(fills: readonly Paint[], opacity: number = 1): [number, number, number, number] | null {
  for (let i = fills.length - 1; i >= 0; i--) {
    const fill = fills[i];
    if (fill.type === "SOLID" && fill.visible !== false) {
      const a = (fill.opacity ?? 1) * opacity;
      return [fill.color.r * 255, fill.color.g * 255, fill.color.b * 255, a];
    }
  }
  return null;
}

// WCAG 2.1 relative luminance
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- check_contrast ---
registerOperation({
  manifest: {
    name: "check_contrast",
    description: "Check color contrast ratios for all text nodes against their parent backgrounds. Reports WCAG AA and AAA compliance.",
    category: "accessibility",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ results: Array<{nodeId, text_preview, ratio, aa_pass, aaa_pass, font_size}>, passing: number, failing: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const textNodes =
      scope === "selection"
        ? (figma.currentPage.selection.filter((n) => n.type === "TEXT") as TextNode[])
        : (figma.currentPage.findAll((n) => n.type === "TEXT") as TextNode[]);

    const results: Array<{
      nodeId: string;
      text_preview: string;
      ratio: number;
      aa_pass: boolean;
      aaa_pass: boolean;
      font_size: number | string;
    }> = [];

    for (const textNode of textNodes) {
      const textColor = computeColor(
        textNode.fills as readonly Paint[],
        textNode.opacity
      );
      if (!textColor) continue;

      // Walk up to find background
      let bgColor: [number, number, number, number] | null = null;
      let parent = textNode.parent;
      while (parent && !bgColor) {
        if ("fills" in parent) {
          bgColor = computeColor((parent as GeometryMixin).fills as readonly Paint[]);
        }
        parent = parent.parent;
      }
      if (!bgColor) bgColor = [255, 255, 255, 1]; // assume white

      const fgLum = luminance(textColor[0], textColor[1], textColor[2]);
      const bgLum = luminance(bgColor[0], bgColor[1], bgColor[2]);
      const ratio = Math.round(contrastRatio(fgLum, bgLum) * 100) / 100;

      const fontSize = textNode.fontSize;
      const isLargeText =
        typeof fontSize === "number" && (fontSize >= 18 || (fontSize >= 14 && textNode.fontWeight >= 700));

      const aaThreshold = isLargeText ? 3 : 4.5;
      const aaaThreshold = isLargeText ? 4.5 : 7;

      results.push({
        nodeId: textNode.id,
        text_preview: textNode.characters.slice(0, 40),
        ratio,
        aa_pass: ratio >= aaThreshold,
        aaa_pass: ratio >= aaaThreshold,
        font_size: typeof fontSize === "number" ? fontSize : "mixed",
      });
    }

    const passing = results.filter((r) => r.aa_pass).length;
    const failing = results.length - passing;

    return {
      results: results.slice(0, 200),
      total_checked: results.length,
      passing,
      failing,
      summary: `Checked ${results.length} text nodes. ${passing} pass WCAG AA, ${failing} fail.`,
    };
  },
});

// --- check_touch_targets ---
registerOperation({
  manifest: {
    name: "check_touch_targets",
    description: "Find interactive elements (buttons, links, inputs) smaller than 44x44px minimum touch target size (WCAG 2.5.8).",
    category: "accessibility",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
      min_size: { type: "number", required: false, description: "Minimum touch target size in px (default: 44)" },
    },
    returns: "{ violations: Array<{nodeId, nodeName, width, height}>, count: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const minSize = params.min_size || 44;

    const nodes =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const interactivePatterns = /button|btn|link|input|toggle|switch|checkbox|radio|tab|chip|tag|cta/i;
    const violations: Array<{ nodeId: string; nodeName: string; width: number; height: number }> = [];

    for (const node of nodes) {
      if (!interactivePatterns.test(node.name)) continue;
      if (!("width" in node)) continue;

      const width = Math.round((node as any).width);
      const height = Math.round((node as any).height);

      if (width < minSize || height < minSize) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          width,
          height,
        });
      }
    }

    return {
      violations: violations.slice(0, 200),
      count: violations.length,
      summary: `Found ${violations.length} interactive elements below ${minSize}x${minSize}px.`,
    };
  },
});
```

- [ ] **Step 2: Register in index**

Add to `packages/bridge-plugin/src/operations/index.ts`:
```typescript
import "./accessibility";
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/bridge-plugin && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add accessibility operations — check_contrast, check_touch_targets"
```

---

### Task 9: Component management operations

**Files:**
- Create: `packages/bridge-plugin/src/operations/components.ts`
- Modify: `packages/bridge-plugin/src/operations/index.ts`

- [ ] **Step 1: Implement component operations**

```typescript
// packages/bridge-plugin/src/operations/components.ts
import { registerOperation } from "./index";

// --- find_instances ---
registerOperation({
  manifest: {
    name: "find_instances",
    description: "Find all instances of a component by name or component key across the current page.",
    category: "components",
    params: {
      name: { type: "string", required: false, description: "Component name to search for (partial match)" },
      component_key: { type: "string", required: false, description: "Exact component key" },
    },
    returns: "{ instances: Array<{nodeId, nodeName, componentName, page}>, count: number, summary: string }",
  },
  async execute(params) {
    const instances: Array<{ nodeId: string; nodeName: string; componentName: string }> = [];

    const allInstances = figma.currentPage.findAll(
      (n) => n.type === "INSTANCE"
    ) as InstanceNode[];

    for (const inst of allInstances) {
      const mainComp = await inst.getMainComponentAsync();
      if (!mainComp) continue;

      if (params.component_key && mainComp.key === params.component_key) {
        instances.push({ nodeId: inst.id, nodeName: inst.name, componentName: mainComp.name });
      } else if (params.name && mainComp.name.toLowerCase().includes(params.name.toLowerCase())) {
        instances.push({ nodeId: inst.id, nodeName: inst.name, componentName: mainComp.name });
      } else if (!params.name && !params.component_key) {
        instances.push({ nodeId: inst.id, nodeName: inst.name, componentName: mainComp.name });
      }
    }

    return {
      instances: instances.slice(0, 200),
      count: instances.length,
      summary: `Found ${instances.length} instances${params.name ? ` matching "${params.name}"` : ""}.`,
    };
  },
});

// --- analyze_overrides ---
registerOperation({
  manifest: {
    name: "analyze_overrides",
    description: "Analyze all component instances and report which have overrides applied, what fields are overridden, and how many.",
    category: "components",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ instances: Array<{nodeId, nodeName, overrideCount, overriddenFields}>, total_instances: number, with_overrides: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? (figma.currentPage.selection.filter((n) => n.type === "INSTANCE") as InstanceNode[])
        : (figma.currentPage.findAll((n) => n.type === "INSTANCE") as InstanceNode[]);

    const results: Array<{
      nodeId: string;
      nodeName: string;
      overrideCount: number;
      overriddenFields: string[];
    }> = [];

    for (const inst of nodes) {
      const overrides = inst.overrides;
      if (overrides && overrides.length > 0) {
        const fields = new Set<string>();
        for (const ov of overrides) {
          for (const field of ov.overriddenFields) {
            fields.add(field);
          }
        }
        results.push({
          nodeId: inst.id,
          nodeName: inst.name,
          overrideCount: overrides.length,
          overriddenFields: Array.from(fields),
        });
      }
    }

    return {
      instances: results.slice(0, 200),
      total_instances: nodes.length,
      with_overrides: results.length,
      summary: `${results.length} of ${nodes.length} instances have overrides.`,
    };
  },
});
```

- [ ] **Step 2: Register and build**

Add `import "./components";` to `operations/index.ts`.

```bash
cd packages/bridge-plugin && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add component operations — find_instances, analyze_overrides"
```

---

### Task 10: Cleanup operations

**Files:**
- Create: `packages/bridge-plugin/src/operations/cleanup.ts`
- Modify: `packages/bridge-plugin/src/operations/index.ts`

- [ ] **Step 1: Implement cleanup operations**

```typescript
// packages/bridge-plugin/src/operations/cleanup.ts
import { registerOperation } from "./index";

// --- rename_layers ---
registerOperation({
  manifest: {
    name: "rename_layers",
    description: "Batch rename layers using find/replace, prefix, suffix, or sequential numbering.",
    category: "cleanup",
    params: {
      find: { type: "string", required: false, description: "Text to find in layer names" },
      replace: { type: "string", required: false, description: "Replacement text" },
      prefix: { type: "string", required: false, description: "Prefix to add" },
      suffix: { type: "string", required: false, description: "Suffix to add" },
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ renamed: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    let renamed = 0;

    for (const node of nodes) {
      let newName = node.name;

      if (params.find && params.replace !== undefined) {
        const regex = new RegExp(params.find, "g");
        newName = newName.replace(regex, params.replace);
      }
      if (params.prefix) {
        newName = params.prefix + newName;
      }
      if (params.suffix) {
        newName = newName + params.suffix;
      }

      if (newName !== node.name) {
        node.name = newName;
        renamed++;
      }
    }

    figma.commitUndo();
    return {
      renamed,
      summary: `Renamed ${renamed} layers.`,
    };
  },
});

// --- remove_hidden ---
registerOperation({
  manifest: {
    name: "remove_hidden",
    description: "Find and optionally remove all hidden (invisible) layers on the current page.",
    category: "cleanup",
    params: {
      dry_run: { type: "boolean", required: false, description: "If true, only report without removing (default: true)" },
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ hidden: Array<{nodeId, nodeName}>, count: number, removed: boolean, summary: string }",
  },
  async execute(params) {
    const dryRun = params.dry_run !== false;
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    const hidden: Array<{ nodeId: string; nodeName: string }> = [];

    for (const node of nodes) {
      if (!node.visible) {
        hidden.push({ nodeId: node.id, nodeName: node.name });
      }
    }

    if (!dryRun) {
      // Remove in reverse to avoid index issues
      for (const item of hidden.reverse()) {
        const node = figma.getNodeById(item.nodeId);
        if (node) node.remove();
      }
      figma.commitUndo();
    }

    return {
      hidden: hidden.slice(0, 200),
      count: hidden.length,
      removed: !dryRun,
      summary: dryRun
        ? `Found ${hidden.length} hidden layers (dry run — not removed).`
        : `Removed ${hidden.length} hidden layers.`,
    };
  },
});

// --- round_values ---
registerOperation({
  manifest: {
    name: "round_values",
    description: "Round all fractional x, y, width, height values to whole pixels for pixel-perfect designs.",
    category: "cleanup",
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
      dry_run: { type: "boolean", required: false, description: "If true, only report (default: true)" },
    },
    returns: "{ fractional: Array<{nodeId, nodeName, property, before, after}>, count: number, summary: string }",
  },
  async execute(params) {
    const dryRun = params.dry_run !== false;
    const scope = params.scope || "page";
    const nodes =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    const fractional: Array<{
      nodeId: string;
      nodeName: string;
      property: string;
      before: number;
      after: number;
    }> = [];

    for (const node of nodes) {
      for (const prop of ["x", "y"] as const) {
        if (prop in node) {
          const val = (node as any)[prop];
          if (typeof val === "number" && val !== Math.round(val)) {
            fractional.push({
              nodeId: node.id,
              nodeName: node.name,
              property: prop,
              before: val,
              after: Math.round(val),
            });
            if (!dryRun) (node as any)[prop] = Math.round(val);
          }
        }
      }

      if ("width" in node && "height" in node) {
        const w = (node as any).width;
        const h = (node as any).height;
        if (typeof w === "number" && w !== Math.round(w)) {
          fractional.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "width",
            before: w,
            after: Math.round(w),
          });
        }
        if (typeof h === "number" && h !== Math.round(h)) {
          fractional.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "height",
            before: h,
            after: Math.round(h),
          });
        }
        if (!dryRun && (w !== Math.round(w) || h !== Math.round(h))) {
          (node as any).resize(Math.round(w), Math.round(h));
        }
      }
    }

    if (!dryRun) figma.commitUndo();

    return {
      fractional: fractional.slice(0, 200),
      count: fractional.length,
      summary: dryRun
        ? `Found ${fractional.length} fractional values (dry run).`
        : `Rounded ${fractional.length} values to whole pixels.`,
    };
  },
});
```

- [ ] **Step 2: Register and build**

Add `import "./cleanup";` to `operations/index.ts`.

```bash
cd packages/bridge-plugin && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add cleanup operations — rename_layers, remove_hidden, round_values"
```

---

### Task 11: Token & layout operations

**Files:**
- Create: `packages/bridge-plugin/src/operations/tokens.ts`
- Create: `packages/bridge-plugin/src/operations/layout.ts`
- Modify: `packages/bridge-plugin/src/operations/index.ts`

- [ ] **Step 1: Implement token operations**

```typescript
// packages/bridge-plugin/src/operations/tokens.ts
import { registerOperation } from "./index";

// --- list_variables ---
registerOperation({
  manifest: {
    name: "list_variables",
    description: "List all local variables and variable collections in the file, grouped by collection.",
    category: "tokens",
    params: {
      type: { type: "string", required: false, description: "Filter by type: 'COLOR', 'FLOAT', 'STRING', 'BOOLEAN'" },
    },
    returns: "{ collections: Array<{name, id, modes, variables: Array<{name, type, values}>}>, total_variables: number }",
  },
  async execute(params) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const result: Array<{
      name: string;
      id: string;
      modes: string[];
      variableCount: number;
    }> = [];

    let totalVars = 0;

    for (const collection of collections) {
      const variables = [];
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        if (params.type && variable.resolvedType !== params.type) continue;
        variables.push({
          name: variable.name,
          type: variable.resolvedType,
          id: variable.id,
        });
      }
      totalVars += variables.length;
      result.push({
        name: collection.name,
        id: collection.id,
        modes: collection.modes.map((m) => m.name),
        variableCount: variables.length,
      });
    }

    return {
      collections: result,
      total_variables: totalVars,
      summary: `${collections.length} collections, ${totalVars} variables.`,
    };
  },
});

// --- export_tokens ---
registerOperation({
  manifest: {
    name: "export_tokens",
    description: "Export all local variables as a structured JSON token map, compatible with Tokens Studio format.",
    category: "tokens",
    params: {},
    returns: "{ tokens: Record<collectionName, Record<modeName, Record<variableName, value>>> }",
  },
  async execute() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const tokens: Record<string, Record<string, Record<string, unknown>>> = {};

    for (const collection of collections) {
      tokens[collection.name] = {};

      for (const mode of collection.modes) {
        tokens[collection.name][mode.name] = {};

        for (const varId of collection.variableIds) {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable) continue;

          const value = variable.valuesByMode[mode.modeId];
          let exportedValue: unknown = value;

          // Convert Figma color objects to hex
          if (variable.resolvedType === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
            const c = value as RGBA;
            const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
            exportedValue = `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
            if (c.a !== undefined && c.a < 1) {
              exportedValue += toHex(c.a);
            }
          }

          tokens[collection.name][mode.name][variable.name] = exportedValue;
        }
      }
    }

    return { tokens };
  },
});
```

- [ ] **Step 2: Implement layout operations**

```typescript
// packages/bridge-plugin/src/operations/layout.ts
import { registerOperation } from "./index";

// --- audit_spacing ---
registerOperation({
  manifest: {
    name: "audit_spacing",
    description: "Audit spacing values (padding, gap, item spacing) across auto-layout frames. Reports non-standard values.",
    category: "layout",
    params: {
      allowed_values: { type: "string[]", required: false, description: "Allowed spacing values (e.g., ['0','4','8','12','16','24','32','48'])" },
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ frames: Array<{nodeId, nodeName, property, value}>, unique_values: number[], violations: number, summary: string }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const allowed = params.allowed_values
      ? params.allowed_values.map(Number)
      : null;

    const nodes =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const allValues = new Set<number>();
    const violations: Array<{
      nodeId: string;
      nodeName: string;
      property: string;
      value: number;
    }> = [];

    for (const node of nodes) {
      if (!("layoutMode" in node)) continue;
      const frame = node as FrameNode;
      if (frame.layoutMode === "NONE") continue;

      const spacingProps: Array<[string, number]> = [
        ["itemSpacing", frame.itemSpacing],
        ["paddingLeft", frame.paddingLeft],
        ["paddingRight", frame.paddingRight],
        ["paddingTop", frame.paddingTop],
        ["paddingBottom", frame.paddingBottom],
      ];

      if (frame.counterAxisSpacing !== null) {
        spacingProps.push(["counterAxisSpacing", frame.counterAxisSpacing]);
      }

      for (const [prop, val] of spacingProps) {
        allValues.add(val);
        if (allowed && !allowed.includes(val)) {
          violations.push({
            nodeId: frame.id,
            nodeName: frame.name,
            property: prop,
            value: val,
          });
        }
      }
    }

    return {
      violations: violations.slice(0, 200),
      total_violations: violations.length,
      unique_values: Array.from(allValues).sort((a, b) => a - b),
      summary: allowed
        ? `Found ${violations.length} non-standard spacing values. Unique values: ${Array.from(allValues).sort((a, b) => a - b).join(", ")}`
        : `Found ${allValues.size} unique spacing values: ${Array.from(allValues).sort((a, b) => a - b).join(", ")}`,
    };
  },
});
```

- [ ] **Step 3: Register and build**

Add to `operations/index.ts`:
```typescript
import "./tokens";
import "./layout";
```

```bash
cd packages/bridge-plugin && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-plugin
git commit -m "feat: add token operations (list_variables, export_tokens) and layout operations (audit_spacing)"
```

---

## Chunk 5: Integration Testing & README

### Task 12: End-to-end integration test

**Files:**
- Create: `packages/mcp-server/src/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/mcp-server/src/__tests__/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { PluginOSWebSocketServer } from "../websocket";

describe("MCP Server ↔ Plugin integration", () => {
  let server: PluginOSWebSocketServer;
  let mockPlugin: WebSocket;

  beforeAll(async () => {
    server = new PluginOSWebSocketServer({ portRange: [9560, 9560] });
    await server.start();

    mockPlugin = new WebSocket("ws://localhost:9560");
    await new Promise<void>((resolve) => mockPlugin.on("open", resolve));

    // Simulate plugin sending status
    mockPlugin.send(
      JSON.stringify({
        type: "status",
        fileKey: "test123",
        fileName: "Test File",
        currentPage: "Page 1",
      })
    );

    // Mock plugin: respond to operations
    mockPlugin.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "run_operation" && msg.operation === "__list_operations") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: [
              { name: "lint_styles", description: "Lint styles", category: "lint" },
              { name: "check_contrast", description: "Check contrast", category: "accessibility" },
            ],
          })
        );
      } else if (msg.type === "run_operation") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: { summary: `Executed ${msg.operation}`, params: msg.params },
          })
        );
      } else if (msg.type === "execute") {
        mockPlugin.send(
          JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            result: 42,
          })
        );
      }
    });

    // Wait for status to be processed
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    mockPlugin.close();
    await server.close();
  });

  it("reports connected status with file info", () => {
    const status = server.getStatus();
    expect(status.connected).toBe(true);
    expect(status.fileKey).toBe("test123");
    expect(status.fileName).toBe("Test File");
  });

  it("sends run_operation and receives result", async () => {
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("lint_styles", { scope: "page" });
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("summary");
  });

  it("sends execute and receives result", async () => {
    const { createExecuteMessage } = await import("@pluginos/shared");
    const msg = createExecuteMessage("return 42");
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("lists operations via __list_operations", async () => {
    const { createRunOperationMessage } = await import("@pluginos/shared");
    const msg = createRunOperationMessage("__list_operations", {});
    const result = await server.sendAndWait(msg);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd packages/mcp-server && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server
git commit -m "test: add MCP server integration tests with mock plugin"
```

---

### Task 13: README and MCP config example

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# PluginOS

Agent-native Figma operations platform. Run any Figma plugin operation from any LLM agent at ~230 tokens per call instead of ~28,000.

## Quick Start

### 1. Add PluginOS to your MCP config

**Claude Code (`~/.claude.json`):**
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos"]
    }
  }
}
```

**Cursor (`.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos"]
    }
  }
}
```

### 2. Install the Bridge Plugin in Figma

1. Open Figma Desktop
2. Right-click canvas → Plugins → Development → Import plugin from manifest
3. Select `packages/bridge-plugin/manifest.json`
4. Run the plugin — it auto-connects to the MCP server

### 3. Use it

Tell your agent: "Check the contrast ratios in my design"

The agent calls `run_operation("check_contrast", {scope: "page"})` → the bridge plugin executes locally → returns structured results → agent sees a clean summary.

## Available Operations

| Operation | Category | Description |
|-----------|----------|-------------|
| `lint_styles` | lint | Find layers without styles |
| `lint_detached` | lint | Find detached instances |
| `lint_naming` | lint | Find default-named layers |
| `check_contrast` | accessibility | WCAG contrast audit |
| `check_touch_targets` | accessibility | Touch target size check |
| `find_instances` | components | Find component instances |
| `analyze_overrides` | components | Report instance overrides |
| `rename_layers` | cleanup | Batch rename layers |
| `remove_hidden` | cleanup | Remove hidden layers |
| `round_values` | cleanup | Round fractional values |
| `list_variables` | tokens | List all variables |
| `export_tokens` | tokens | Export tokens as JSON |
| `audit_spacing` | layout | Audit spacing values |

## Token Economics

| Action | Tokens |
|--------|--------|
| Any built-in operation | ~230 |
| Custom `execute_figma` | ~700 |
| Raw `use_figma` (status quo) | ~8,000-28,000 |

## Architecture

```
Agent ─── MCP protocol ──→ PluginOS MCP Server ─── WebSocket ──→ Bridge Plugin (Figma)
                           (thin router)                         (operations + figma.* access)
```

The MCP server sends only operation names + params (~100 bytes). All heavy computation happens inside the Figma plugin. Scripts never touch the LLM context.

## Adding Custom Operations

See `packages/bridge-plugin/src/operations/` for examples. Each operation exports a manifest + execute function. Register in `operations/index.ts`.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start, operations list, and architecture overview"
```

---

## Summary

| Chunk | Tasks | What It Delivers |
|-------|-------|-----------------|
| **Chunk 1** | Tasks 1-2 | Monorepo scaffold, shared types, protocol |
| **Chunk 2** | Tasks 3-4 | Working MCP server with WebSocket + 4 tools |
| **Chunk 3** | Tasks 5-6 | Working bridge plugin with operation router + execute_figma |
| **Chunk 4** | Tasks 7-11 | 13 operations across 6 categories (Phase 1 MVP) |
| **Chunk 5** | Tasks 12-13 | Integration tests + README |

After Chunk 3, you have a working end-to-end system (MCP server ↔ bridge plugin) with `execute_figma` support. Chunks 4-5 add the pre-built operations that make it fast.
