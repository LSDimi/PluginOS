import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type {
  ServerToPluginMessage,
  ResultMessage,
  StatusMessage,
  IPluginBridge,
  BridgeStatus,
  FileInfo,
} from "@pluginos/shared";
import { parseMessage } from "@pluginos/shared";
import { resolveFileTarget } from "./targeting.js";
import { UpgradeRouter } from "./agent/upgrade-router.js";
import pkg from "../package.json" with { type: "json" };

const SERVER_VERSION = pkg.version;

interface ConnectedFile {
  ws: WebSocket;
  fileKey: string;
  fileName: string;
  currentPage: string;
  lastActivity: number;
  restConfigured: boolean;
}

interface PendingRequest {
  resolve: (value: ResultMessage) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  fileKey: string;
}

interface WebSocketServerOptions {
  portRange?: [number, number];
  httpServer?: Server;
}

export class WebSocketPluginBridge implements IPluginBridge {
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private router: UpgradeRouter | null = null;
  private files = new Map<string, ConnectedFile>();
  private activeFileKey: string | null = null;
  private port: number | null = null;
  private pending = new Map<string, PendingRequest>();
  private options: { portRange: [number, number] };

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
      const verifyClient = (info: { origin: string }, cb: (result: boolean) => void) => {
        const origin = info.origin;
        const allowed =
          !origin ||
          origin === "null" ||
          origin.startsWith("https://www.figma.com") ||
          origin.startsWith("https://figma.com");
        cb(allowed);
      };

      if (this.httpServer) {
        // Listen first, then attach WebSocket after port is confirmed.
        // Both listeners must be removed on either outcome: listen(port, cb)
        // registers cb via once("listening"), and a callback leaked by a
        // failed EADDRINUSE attempt would fire again on the eventually
        // successful bind — constructing one WebSocketServer per failed
        // attempt and crashing ws with "handleUpgrade() was called more
        // than once" on the first client connection.
        const cleanup = () => {
          this.httpServer!.removeListener("error", onError);
          this.httpServer!.removeListener("listening", onListening);
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const onListening = () => {
          cleanup();
          const wss = new WebSocketServer({ noServer: true });
          this.router!.register("/", wss);
          this.wss = wss;
          this.setupServer();
          resolve();
        };
        this.httpServer.once("error", onError);
        this.httpServer.once("listening", onListening);
        this.httpServer.listen(port, process.env.PLUGINOS_HOST || "127.0.0.1");
      } else {
        // Standalone WebSocket server (tests)
        const wss = new WebSocketServer({
          port,
          host: process.env.PLUGINOS_HOST || "127.0.0.1",
          verifyClient,
        });
        wss.on("listening", () => {
          this.wss = wss;
          this.setupServer();
          resolve();
        });
        wss.on("error", reject);
      }
    });
  }

  private setupServer(): void {
    this.wss!.on("connection", (ws) => {
      let fileKey: string | null = null;

      // Emit a hello message so the plugin UI can check version compatibility
      // before treating this connection as usable.
      try {
        ws.send(JSON.stringify({ type: "SERVER_HELLO", version: SERVER_VERSION }));
      } catch {
        // ignore — socket may already be closing
      }

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
          const key = status.fileKey || "unknown";
          const previousKey = fileKey;
          // Identity upgrade: the plugin can legitimately change its reported
          // fileKey mid-connection (e.g. synthetic id -> verified real key
          // once list_comments validates one). If it does, drop the stale
          // entry for the old key on this same socket so we don't end up
          // double-counting one connection as two files, and re-key any
          // in-flight pending requests so their close-cleanup still matches.
          if (previousKey && previousKey !== key) {
            this.files.delete(previousKey);
            for (const p of this.pending.values()) {
              if (p.fileKey === previousKey) {
                p.fileKey = key;
              }
            }
          }
          fileKey = key;
          this.files.set(key, {
            ws,
            fileKey: key,
            fileName: status.fileName,
            currentPage: status.currentPage,
            lastActivity: Date.now(),
            restConfigured: status.rest_configured === true,
          });
          // Always point activeFileKey at the latest reported key for this
          // connection — this already covers the case where activeFileKey
          // was pointing at the stale previousKey.
          this.activeFileKey = key;
        }
      });

      ws.on("close", () => {
        if (fileKey && this.files.has(fileKey)) {
          this.files.delete(fileKey);
          if (this.activeFileKey === fileKey) {
            const remaining = Array.from(this.files.values());
            remaining.sort((a, b) => b.lastActivity - a.lastActivity);
            this.activeFileKey = remaining.length > 0 ? remaining[0].fileKey : null;
          }
        }
        // Only reject pending requests for THIS file
        for (const [id, p] of this.pending) {
          if (p.fileKey === fileKey) {
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.reject(new Error("Plugin disconnected"));
          }
        }
      });
    });
  }

  isConnected(fileKey?: string): boolean {
    if (fileKey) return this.files.has(fileKey);
    return this.files.size > 0;
  }

  getActiveFileKey(): string | null {
    return this.activeFileKey;
  }

  setActiveFile(fileKey: string): boolean {
    if (!this.files.has(fileKey)) return false;
    this.activeFileKey = fileKey;
    return true;
  }

  listFiles(): FileInfo[] {
    return Array.from(this.files.values()).map((f) => ({
      fileKey: f.fileKey,
      fileName: f.fileName,
      currentPage: f.currentPage,
    }));
  }

  getStatus(): BridgeStatus {
    const active = this.activeFileKey ? this.files.get(this.activeFileKey) : null;
    return {
      connected: this.files.size > 0,
      fileKey: active?.fileKey ?? null,
      fileName: active?.fileName ?? null,
      currentPage: active?.currentPage ?? null,
      port: this.port,
      connectedFiles: this.files.size,
      rest: active ? (active.restConfigured ? "configured" : "not_configured") : null,
    };
  }

  sendAndWait(
    message: ServerToPluginMessage,
    timeout: number = 30000,
    fileKey?: string
  ): Promise<ResultMessage> {
    return new Promise((resolve, reject) => {
      const resolution = resolveFileTarget(this.files, fileKey, this.activeFileKey);
      if ("error" in resolution) {
        reject(new Error(resolution.error));
        return;
      }
      const targetKey = resolution.key;
      const note = resolution.note;
      const file = this.files.get(targetKey)!;
      if (file.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`Connection to "${file.fileName}" is not open.`));
        return;
      }

      file.lastActivity = Date.now();
      this.activeFileKey = targetKey;

      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      const resolveWithNote = (r: ResultMessage) => {
        if (note && r.result && typeof r.result === "object" && !Array.isArray(r.result)) {
          r = { ...r, result: { ...(r.result as object), _target_note: note } };
        }
        resolve(r);
      };
      this.pending.set(message.id, { resolve: resolveWithNote, reject, timer, fileKey: targetKey });
      file.ws.send(JSON.stringify(message));
    });
  }

  async close(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Server closing"));
    }
    this.pending.clear();

    for (const f of this.files.values()) {
      f.ws.close();
    }
    this.files.clear();
    this.activeFileKey = null;

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
