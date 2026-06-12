// packages/mcp-server/src/singleton/types.ts

export interface StateFile {
  version: 1;
  pid: number;
  port: number;
  serverVersion: string;
  startedAt: number;
  parentPid: number;
  parentAlive: boolean;
  socketPath: string | null;
}

export interface SingletonInfo {
  takeoverFromPid?: number;
  stateDir: string;
  pidFilePath: string;
  stateFilePath: string;
  lockFilePath: string;
}

export interface LockAcquisition {
  acquired: boolean;
  oldPid: number | null;
}
