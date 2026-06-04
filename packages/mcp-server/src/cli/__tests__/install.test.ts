import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBridge, type InstallOptions } from "../install.js";

const FIXTURE_FILES = {
  "manifest.json": '{"name":"PluginOS Bridge","version":"0.4.4"}',
  "code.js": "// stub code",
  "ui.html": "<html></html>",
  "bootloader.html": "<html></html>",
};

async function setupSourceDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pluginos-source-"));
  for (const [name, contents] of Object.entries(FIXTURE_FILES)) {
    await writeFile(join(dir, name), contents);
  }
  return dir;
}

describe("installBridge", () => {
  let targetDir: string;
  let sourceDir: string;
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), "pluginos-target-"));
    sourceDir = await setupSourceDir();
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    log.mockRestore();
    err.mockRestore();
    await rm(targetDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it("copies all 4 bridge files to the target dir", async () => {
    const opts: InstallOptions = { sourceDir, targetDir };
    const result = await installBridge(opts);
    expect(result.ok).toBe(true);
    expect(result.version).toBe("0.4.4");
    for (const name of Object.keys(FIXTURE_FILES)) {
      const content = await readFile(join(targetDir, name), "utf-8");
      expect(content).toBe(FIXTURE_FILES[name as keyof typeof FIXTURE_FILES]);
    }
  });

  it("is idempotent: re-running with new contents overwrites", async () => {
    await installBridge({ sourceDir, targetDir });
    await writeFile(
      join(sourceDir, "manifest.json"),
      '{"name":"PluginOS Bridge","version":"0.4.5"}'
    );
    const result = await installBridge({ sourceDir, targetDir });
    expect(result.ok).toBe(true);
    expect(result.version).toBe("0.4.5");
    const manifest = await readFile(join(targetDir, "manifest.json"), "utf-8");
    expect(manifest).toContain("0.4.5");
  });

  it("creates the target dir if missing", async () => {
    const nestedTarget = join(targetDir, "nested", "bridge");
    const result = await installBridge({ sourceDir, targetDir: nestedTarget });
    expect(result.ok).toBe(true);
    const manifest = await readFile(join(nestedTarget, "manifest.json"), "utf-8");
    expect(manifest).toContain("0.4.4");
  });

  it("fails when sourceDir is missing files", async () => {
    const brokenSource = await mkdtemp(join(tmpdir(), "pluginos-broken-"));
    try {
      await writeFile(join(brokenSource, "manifest.json"), "{}");
      const result = await installBridge({ sourceDir: brokenSource, targetDir });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/missing/i);
    } finally {
      await rm(brokenSource, { recursive: true, force: true });
    }
  });

  it("reports the correct version on success", async () => {
    const result = await installBridge({ sourceDir, targetDir });
    expect(result.version).toBe("0.4.4");
  });

  it("uses 'updated' verb on second run (idempotency reflected in output)", async () => {
    const first = await installBridge({ sourceDir, targetDir });
    expect(first.action).toBe("installed");
    const second = await installBridge({ sourceDir, targetDir });
    expect(second.action).toBe("updated");
  });
});
