import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCursorMcpConfig } from "../agents/cursor.js";

describe("writeCursorMcpConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-cursor-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the file when missing, with just the pluginos entry", async () => {
    const path = join(dir, "mcp.json");
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.pluginos.command).toBe("npx");
    expect(written.mcpServers.pluginos.args).toEqual(["-y", "pluginos@latest"]);
  });

  it("preserves other mcpServers entries when adding pluginos", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          other: { command: "other-server" },
        },
      })
    );
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.other).toEqual({ command: "other-server" });
    expect(written.mcpServers.pluginos.command).toBe("npx");
  });

  it("overwrites existing pluginos entry", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          pluginos: { command: "old-command", args: ["old"] },
        },
      })
    );
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.pluginos.command).toBe("npx");
    expect(written.mcpServers.pluginos.args).toEqual(["-y", "pluginos@latest"]);
  });

  it("adds mcpServers key when missing", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(path, JSON.stringify({ otherKey: "value" }));
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.otherKey).toBe("value");
    expect(written.mcpServers.pluginos).toBeDefined();
  });

  it("refuses to clobber malformed JSON", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(path, "{ not valid json");
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid json/i);
    const after = await readFile(path, "utf-8");
    expect(after).toBe("{ not valid json");
  });
});
