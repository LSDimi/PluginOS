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

  // Construction happens while the lock is held: any failure below must
  // release the lock and tear down whatever was already opened, or the
  // next runDaemon in this process would find a leaked lock file.
  let currentState: StateFile | null = null;
  let httpServer: ReturnType<typeof createHttpServer> | null = null;
  let bridge: WebSocketPluginBridge | null = null;
  let agentEndpoint: AgentEndpoint | null = null;
  let port: number;
  let state: StateFile;
  try {
    httpServer = createHttpServer(
      () => loadUiContent(),
      () => currentState
    );
    bridge = new WebSocketPluginBridge({ httpServer, portRange: opts.portRange });
    port = await bridge.start();
    console.error(`PluginOS daemon: WebSocket + HTTP on port ${port}`);

    agentEndpoint = new AgentEndpoint(bridge, opts.version);
    agentEndpoint.register(bridge.getRouter()!);

    state = buildStateFile({
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
  } catch (err) {
    if (agentEndpoint) await agentEndpoint.close().catch(() => {});
    if (bridge) await bridge.close().catch(() => {});
    if (httpServer) {
      const server = httpServer;
      await new Promise<void>((r) => server.close(() => r()));
    }
    await releaseSingletonLock(info).catch(() => {});
    throw err;
  }
  const ep = agentEndpoint;
  const pluginBridge = bridge;
  const http = httpServer;

  // Serialize state.json rewrites: writeStateFile shares one tmp path, so
  // two overlapping fire-and-forget writes could land on disk out of order.
  let stateWriteChain: Promise<void> = Promise.resolve();

  const unregisterShutdownHandlers = registerShutdownHandlers(info);

  let closed = false;
  const cleanup = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    lifetime.dispose();
    unregisterShutdownHandlers();
    // Quiesce count events BEFORE closing the endpoint: closing attached
    // sockets fires onCountChange during close, which would otherwise queue
    // a writeStateFile that lands after clearSingletonState and resurrects
    // a stale state.json.
    ep.onCountChange(() => {});
    await ep.close();
    await stateWriteChain.catch(() => {});
    await pluginBridge.close();
    await new Promise<void>((r) => http.close(() => r()));
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
  const applyCount = (n: number): void => {
    lifetime.update(n);
    const next: StateFile = { ...state, parentAlive: n > 0, attachedAgents: n };
    currentState = next;
    stateWriteChain = stateWriteChain
      .then(() => writeStateFile(info.stateFilePath, next))
      .catch(() => {});
  };
  ep.onCountChange(applyCount);
  // Reconcile at boot: an agent may have attached between register() and the
  // onCountChange wiring above; a hardcoded update(0) would miss it and leave
  // state.json stale.
  const bootCount = ep.getCount();
  if (bootCount > 0) {
    applyCount(bootCount);
  } else {
    lifetime.update(0);
  }

  return { port, bridge: pluginBridge, agentEndpoint: ep, close: cleanup };
}

// Moved from index.ts, minus the parent-liveness timers (replaced by
// DaemonLifetime). Returns an unregister function so repeated
// runDaemon()+close() cycles don't accumulate process listeners.
function registerShutdownHandlers(info: SingletonInfo): () => void {
  const cleanup = async (): Promise<void> => {
    await clearSingletonState(info);
  };
  const onSignal = async (): Promise<void> => {
    await cleanup();
    process.exit(0);
  };
  const onExit = (): void => {
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
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  process.on("exit", onExit);
  return () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
    process.off("exit", onExit);
  };
}
