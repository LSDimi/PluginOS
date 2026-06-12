import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePidFile, readPidFile, removePidFile } from "../pid-file.js";

describe("pid-file r/w", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-pid-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a pid atomically (tmp + rename)", async () => {
    const path = join(dir, "server.pid");
    await writePidFile(path, 12345);
    const read = await readPidFile(path);
    expect(read).toBe(12345);
  });

  it("returns null for a missing file", async () => {
    const path = join(dir, "missing.pid");
    expect(await readPidFile(path)).toBeNull();
  });

  it("returns null for a corrupt file", async () => {
    const path = join(dir, "corrupt.pid");
    await writeFile(path, "not-a-number");
    expect(await readPidFile(path)).toBeNull();
  });

  it("removes the pid file", async () => {
    const path = join(dir, "server.pid");
    await writePidFile(path, 42);
    await removePidFile(path);
    expect(await readPidFile(path)).toBeNull();
  });

  it("remove is a no-op when file is missing", async () => {
    const path = join(dir, "missing.pid");
    await expect(removePidFile(path)).resolves.toBeUndefined();
  });
});
