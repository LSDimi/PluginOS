import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

describe("plugin.json", () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, ".claude-plugin/plugin.json"), "utf-8"));

  it("has required fields", () => {
    expect(manifest.name).toBe("pluginos");
    expect(manifest.displayName).toBe("PluginOS for Figma");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toBeTruthy();
    expect(manifest.license).toBe("MIT");
  });

  it("has author with name and url", () => {
    expect(manifest.author).toBeDefined();
    expect(manifest.author.name).toBeTruthy();
    expect(manifest.author.url).toMatch(/^https?:\/\//);
  });

  it("has repository with type and url", () => {
    expect(manifest.repository).toBeDefined();
    expect(manifest.repository.type).toBe("git");
    expect(manifest.repository.url).toMatch(/github\.com/);
  });

  it("version matches package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    expect(manifest.version).toBe(pkg.version);
  });
});

describe(".mcp.json", () => {
  const mcp = JSON.parse(readFileSync(resolve(ROOT, ".mcp.json"), "utf-8"));

  it("has pluginos server entry", () => {
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.pluginos).toBeDefined();
  });

  it("spawns pluginos via npx", () => {
    const server = mcp.mcpServers.pluginos;
    expect(server.command).toBe("npx");
    expect(server.args).toContain("pluginos@latest");
  });
});
