#!/usr/bin/env node
/**
 * Verifies that all PluginOS packages + the Claude plugin manifest share the
 * same version string. Run in CI to catch forgotten bumps.
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const targets = [
  { label: "packages/mcp-server/package.json", path: "packages/mcp-server/package.json", field: "version" },
  { label: "packages/shared/package.json", path: "packages/shared/package.json", field: "version" },
  { label: "packages/bridge-plugin/package.json", path: "packages/bridge-plugin/package.json", field: "version" },
  { label: "packages/claude-plugin/package.json", path: "packages/claude-plugin/package.json", field: "version" },
  {
    label: "packages/claude-plugin/.claude-plugin/plugin.json",
    path: "packages/claude-plugin/.claude-plugin/plugin.json",
    field: "version",
  },
];

const readings = targets.map((t) => {
  const abs = path.join(repoRoot, t.path);
  const json = JSON.parse(fs.readFileSync(abs, "utf8"));
  return { label: t.label, version: json[t.field] };
});

const versions = new Set(readings.map((r) => r.version));

if (versions.size !== 1) {
  console.error("[check-version-lockstep] ✖ Versions are out of sync:");
  for (const r of readings) {
    console.error(`  ${r.version.padEnd(10)} ${r.label}`);
  }
  console.error(
    "\nBump all four package.json files and plugin.json to the same version before committing."
  );
  process.exit(1);
}

const [version] = readings.map((r) => r.version);
console.log(`[check-version-lockstep] ✓ All 5 manifests share version ${version}`);
