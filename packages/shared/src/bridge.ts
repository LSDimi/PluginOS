import type { ServerToPluginMessage, ResultMessage } from "./protocol.js";

export interface FileInfo {
  fileKey: string;
  fileName: string;
  currentPage: string;
}

export interface BridgeStatus {
  connected: boolean;
  fileKey: string | null;
  fileName: string | null;
  currentPage: string | null;
  port: number | null;
  connectedFiles: number;
}

export interface IPluginBridge {
  sendAndWait(
    message: ServerToPluginMessage,
    timeout?: number,
    fileKey?: string
  ): Promise<ResultMessage>;

  getStatus(): BridgeStatus;

  listFiles(): FileInfo[];

  isConnected(fileKey?: string): boolean;
}
