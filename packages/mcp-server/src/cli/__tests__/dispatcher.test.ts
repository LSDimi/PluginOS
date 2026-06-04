import { describe, it, expect, vi } from "vitest";
import { runCli, printUsage, printVersion } from "../index.js";

describe("CLI dispatcher", () => {
  it("printUsage writes usage to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printUsage();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("pluginos");
    expect(output).toContain("install");
    log.mockRestore();
  });

  it("printVersion writes a semver string to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printVersion();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/\d+\.\d+\.\d+/);
    log.mockRestore();
  });

  it("runCli('--help') prints usage and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("runCli('--version') prints version and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("runCli with unknown subcommand returns exit code 1", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["nonsense"]);
    expect(code).toBe(1);
    log.mockRestore();
  });
});
