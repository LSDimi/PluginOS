import { describe, it, expect, vi } from "vitest";
import { printGenericMcpConfig, runGenericAgent } from "../agents/generic.js";

describe("printGenericMcpConfig", () => {
  it("prints the canonical JSON snippet to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printGenericMcpConfig();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("mcpServers");
    expect(output).toContain("pluginos");
    expect(output).toContain("npx");
    expect(output).toContain("pluginos@latest");
    log.mockRestore();
  });

  it("includes common agent config locations", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printGenericMcpConfig();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Cursor");
    expect(output).toContain("Windsurf");
    log.mockRestore();
  });
});

describe("runGenericAgent", () => {
  it("returns exit code 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runGenericAgent();
    expect(code).toBe(0);
    log.mockRestore();
  });
});
