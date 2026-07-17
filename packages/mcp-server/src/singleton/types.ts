// packages/mcp-server/src/singleton/types.ts

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

export interface LockAcquisition {
  acquired: boolean;
  oldPid: number | null;
}
