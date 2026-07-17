import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IPluginBridge } from "@pluginos/shared";
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

// Moved verbatim from index.ts (deleted there in this task).
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
  bridge: IPluginBridge;
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
  return { port, bridge, agentEndpoint, close: cleanup };
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
