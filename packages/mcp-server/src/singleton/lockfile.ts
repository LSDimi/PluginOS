import { open, readFile, unlink } from "node:fs/promises";
import type { LockAcquisition } from "./types.js";

export interface AcquireOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readPidFromLockfile(path: string): Promise<number | null> {
  try {
    const content = (await readFile(path, "utf8")).trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function acquireLock(
  path: string,
  opts: AcquireOptions = {}
): Promise<LockAcquisition> {
  const maxRetries = opts.maxRetries ?? 5;
  const retryDelayMs = opts.retryDelayMs ?? 200;
  let stalePid: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fh = await open(path, "wx");
      await fh.write(String(process.pid));
      await fh.close();
      return { acquired: true, oldPid: stalePid };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const oldPid = await readPidFromLockfile(path);
      if (oldPid !== null && !isProcessAlive(oldPid)) {
        stalePid = oldPid;
        try {
          await unlink(path);
        } catch {
          // race with another process — proceed
        }
        continue;
      }

      if (attempt === maxRetries) {
        return { acquired: false, oldPid };
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  return { acquired: false, oldPid: null };
}

export async function releaseLock(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // best-effort
  }
}
