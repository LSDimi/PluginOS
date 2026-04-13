// --- Message types: MCP Server → Plugin ---

export interface RunOperationMessage {
  id: string;
  type: "run_operation";
  operation: string;
  params: Record<string, unknown>;
  fileKey?: string;
}

export interface ExecuteMessage {
  id: string;
  type: "execute";
  code: string;
  timeout: number;
  fileKey?: string;
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

export function createExecuteMessage(code: string, timeout: number = 5000): ExecuteMessage {
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
