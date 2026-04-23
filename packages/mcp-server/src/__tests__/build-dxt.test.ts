import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", "..");
const outFile = join(pkgRoot, "dist", "pluginos.dxt");

describe("build:dxt", () => {
  beforeAll(() => {
    execSync("node scripts/build-dxt.mjs", { cwd: pkgRoot, stdio: "inherit" });
  });

  it("produces a pluginos.dxt file", () => {
    expect(existsSync(outFile)).toBe(true);
  });

  it("includes manifest.json with the package version", () => {
    const zip = new AdmZip(outFile);
    const entry = zip.getEntry("manifest.json");
    expect(entry).not.toBeNull();
    const manifest = JSON.parse(entry!.getData().toString("utf8"));
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    expect(manifest.version).toBe(pkg.version);
  });

  it("declares pluginos@<version> as the mcp command", () => {
    const zip = new AdmZip(outFile);
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8"));
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    expect(manifest.server.mcp_config.args).toContain(`pluginos@${pkg.version}`);
  });
});
