import { writeFile, readFile, rename, unlink } from "node:fs/promises";
import type { StateFile } from "./types.js";

export interface BuildStateInput {
  pid: number;
  port: number;
  serverVersion: string;
  parentPid: number;
  parentAlive: boolean;
}

export function buildStateFile(input: BuildStateInput): StateFile {
  return {
    version: 1,
    pid: input.pid,
    port: input.port,
    serverVersion: input.serverVersion,
    startedAt: Date.now(),
    parentPid: input.parentPid,
    parentAlive: input.parentAlive,
    socketPath: null,
  };
}

export async function writeStateFile(path: string, state: StateFile): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, path);
}

export async function readStateFile(path: string): Promise<StateFile | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === 1
    ) {
      return parsed as StateFile;
    }
    return null;
  } catch {
    return null;
  }
}

export async function removeStateFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
