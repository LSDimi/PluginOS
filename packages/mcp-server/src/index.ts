import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketPluginBridge } from "./WebSocketPluginBridge.js";
import { createPluginOSServer } from "./server.js";
import { createHttpServer } from "./http-server.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  acquireSingletonLock,
  writeSingletonState,
  clearSingletonState,
  buildStateFile,
  writeStateFile,
} from "./singleton/index.js";
import { unlinkSync } from "node:fs";
import type { SingletonInfo, StateFile } from "./singleton/index.js";

export { createPluginOSServer } from "./server.js";
export {
  WebSocketPluginBridge,
  WebSocketPluginBridge as PluginOSWebSocketServer,
} from "./WebSocketPluginBridge.js";
export type { IPluginBridge, BridgeStatus, FileInfo } from "@pluginos/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUiContent(): string {
  // Monorepo paths are checked FIRST so a standalone `npm run build
  // -w packages/bridge-plugin` is picked up immediately — otherwise the
  // stale copy that tsup bundled into mcp-server/dist wins and serves
  // until mcp-server is rebuilt too. The bundled fallback remains last
  // for npm/npx installs where the bridge-plugin workspace is absent.
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

let singletonInfo: SingletonInfo | null = null;
let currentParentAlive = true;
let parentLivenessInterval: NodeJS.Timeout | null = null;
let selfTerminateTimeout: NodeJS.Timeout | null = null;
let currentState: StateFile | null = null;

const PARENT_LIVENESS_INTERVAL_MS = 10_000;
const ORPHAN_GRACE_MS = 30_000;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function registerShutdownHandlers(): void {
  const cleanup = async (): Promise<void> => {
    if (singletonInfo) {
      await clearSingletonState(singletonInfo);
    }
    if (parentLivenessInterval) {
      clearInterval(parentLivenessInterval);
      parentLivenessInterval = null;
    }
    if (selfTerminateTimeout) {
      clearTimeout(selfTerminateTimeout);
      selfTerminateTimeout = null;
    }
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
    if (singletonInfo) {
      try {
        unlinkSync(singletonInfo.stateFilePath);
      } catch {
        // ignored
      }
      try {
        unlinkSync(singletonInfo.pidFilePath);
      } catch {
        // ignored
      }
    }
  });
}

async function startParentLivenessHeartbeat(initialState: StateFile): Promise<void> {
  parentLivenessInterval = setInterval(async () => {
    if (!singletonInfo) return;
    const alive = isProcessAlive(process.ppid);
    if (alive !== currentParentAlive) {
      currentParentAlive = alive;
      const updated: StateFile = { ...initialState, parentAlive: alive };
      currentState = updated;
      await writeStateFile(singletonInfo.stateFilePath, updated);
    }
    if (!alive && selfTerminateTimeout === null) {
      console.error(
        `[singleton] Parent PID ${initialState.parentPid} is dead. Self-terminating in ${ORPHAN_GRACE_MS / 1000}s.`
      );
      selfTerminateTimeout = setTimeout(() => {
        console.error("[singleton] Grace period elapsed. Exiting.");
        process.exit(0);
      }, ORPHAN_GRACE_MS);
    }
  }, PARENT_LIVENESS_INTERVAL_MS);
}

async function main(): Promise<void> {
  singletonInfo = await acquireSingletonLock();
  if (singletonInfo.takeoverFromPid !== undefined) {
    console.error(`PluginOS server: took over from PID ${singletonInfo.takeoverFromPid}`);
  }
  registerShutdownHandlers();

  const httpServer = createHttpServer(() => loadUiContent(), () => currentState);

  const wsServer = new WebSocketPluginBridge({ httpServer });
  const port = await wsServer.start();
  console.error(`PluginOS WebSocket + HTTP server on port ${port}`);

  // Read package version for state.json
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const state = buildStateFile({
    pid: process.pid,
    port,
    serverVersion: pkg.version,
    parentPid: process.ppid,
    parentAlive: true,
  });
  currentState = state;
  await writeSingletonState(singletonInfo, state);
  await startParentLivenessHeartbeat(state);

  const mcpServer = createPluginOSServer(wsServer);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
