import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { acquireLock, releaseLock } from "./lockfile.js";
import { readPidFile, writePidFile, removePidFile } from "./pid-file.js";
import { reapProcess } from "./takeover.js";
import { writeStateFile, removeStateFile } from "./state-file.js";
import type { SingletonInfo, StateFile } from "./types.js";

export { buildStateFile, writeStateFile, readStateFile, removeStateFile } from "./state-file.js";
export { reapProcess } from "./takeover.js";
export type { StateFile, SingletonInfo } from "./types.js";

export interface AcquireOptions {
  stateDir?: string;
}

function defaultStateDir(): string {
  return process.env.PLUGINOS_STATE_DIR ?? join(homedir(), ".pluginos");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function acquireSingletonLock(opts: AcquireOptions = {}): Promise<SingletonInfo> {
  const stateDir = opts.stateDir ?? defaultStateDir();
  const pidFilePath = join(stateDir, "server.pid");
  const stateFilePath = join(stateDir, "state.json");
  const lockFilePath = join(stateDir, "server.pid.lock");

  try {
    await mkdir(stateDir, { recursive: true });
    await chmod(stateDir, 0o700).catch(() => {
      // chmod can fail on Windows or special FS — ignore
    });
  } catch (err) {
    console.error(
      `[singleton] Failed to create state dir ${stateDir}: ${(err as Error).message}. Continuing in degraded mode.`
    );
    return { stateDir, pidFilePath, stateFilePath, lockFilePath };
  }

  const lock = await acquireLock(lockFilePath);
  if (!lock.acquired) {
    console.error(
      `[singleton] Could not acquire lock at ${lockFilePath} after retries — proceeding without singleton enforcement.`
    );
    return { stateDir, pidFilePath, stateFilePath, lockFilePath };
  }

  let takeoverFromPid: number | undefined;
  const oldPid = await readPidFile(pidFilePath);
  if (oldPid !== null && isProcessAlive(oldPid)) {
    const result = await reapProcess(oldPid);
    if (result.reaped) {
      takeoverFromPid = oldPid;
      console.error(
        `[singleton] Reaped PID ${oldPid} (signal: ${result.usedSignal}). Took over.`
      );
    } else {
      console.error(
        `[singleton] Could not reap PID ${oldPid} — proceeding anyway. Port collision may occur.`
      );
    }
  } else if (oldPid !== null) {
    takeoverFromPid = oldPid;
    console.error(`[singleton] Found stale PID file (${oldPid} not alive). Took over.`);
  }

  await releaseLock(lockFilePath);
  return { takeoverFromPid, stateDir, pidFilePath, stateFilePath, lockFilePath };
}

export async function writeSingletonState(info: SingletonInfo, state: StateFile): Promise<void> {
  try {
    await writePidFile(info.pidFilePath, state.pid);
    await writeStateFile(info.stateFilePath, state);
  } catch (err) {
    console.error(`[singleton] Failed to write state files: ${(err as Error).message}`);
  }
}

export async function clearSingletonState(info: SingletonInfo): Promise<void> {
  await Promise.allSettled([removeStateFile(info.stateFilePath), removePidFile(info.pidFilePath)]);
}
