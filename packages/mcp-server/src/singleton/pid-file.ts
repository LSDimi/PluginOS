import { writeFile, readFile, rename, unlink } from "node:fs/promises";

export async function writePidFile(path: string, pid: number): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, String(pid));
  await rename(tmp, path);
}

export async function readPidFile(path: string): Promise<number | null> {
  try {
    const content = (await readFile(path, "utf8")).trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function removePidFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
