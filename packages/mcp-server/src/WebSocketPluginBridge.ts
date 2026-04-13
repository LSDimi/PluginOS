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

interface ConnectedFile {
  ws: WebSocket;
  fileKey: string;
  fileName: string;
  currentPage: string;
  lastActivity: number;
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
        // Listen first, then attach WebSocket after port is confirmed
        const onError = (err: Error) => {
          this.httpServer!.removeListener("error", onError);
          reject(err);
        };
        this.httpServer.on("error", onError);
        this.httpServer.listen(port, "127.0.0.1", () => {
          this.httpServer!.removeListener("error", onError);
          const wss = new WebSocketServer({ server: this.httpServer!, verifyClient });
          this.wss = wss;
          this.setupServer();
          resolve();
        });
      } else {
        // Standalone WebSocket server (tests)
        const wss = new WebSocketServer({ port, host: "127.0.0.1", verifyClient });
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
          fileKey = key;
          this.files.set(key, {
            ws,
            fileKey: key,
            fileName: status.fileName,
            currentPage: status.currentPage,
            lastActivity: Date.now(),
          });
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
    };
  }

  sendAndWait(
    message: ServerToPluginMessage,
    timeout: number = 30000,
    fileKey?: string
  ): Promise<ResultMessage> {
    return new Promise((resolve, reject) => {
      const targetKey = fileKey || this.activeFileKey;
      if (!targetKey || !this.files.has(targetKey)) {
        reject(
          new Error(
            fileKey
              ? `File "${fileKey}" not connected.`
              : "No plugin connected. Open PluginOS Bridge in Figma."
          )
        );
        return;
      }
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

      this.pending.set(message.id, { resolve, reject, timer, fileKey: targetKey });
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
