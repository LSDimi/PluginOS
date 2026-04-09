import { WebSocketServer, WebSocket } from "ws";
import type {
  ServerToPluginMessage,
  ResultMessage,
  StatusMessage,
} from "@pluginos/shared";
import { parseMessage } from "@pluginos/shared";

interface WebSocketServerOptions {
  portRange: [number, number];
}

export class PluginOSWebSocketServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port: number | null = null;
  private pending = new Map<
    string,
    {
      resolve: (result: ResultMessage) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
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
        reject(
          new Error("Plugin not connected. Open PluginOS Bridge in Figma.")
        );
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
