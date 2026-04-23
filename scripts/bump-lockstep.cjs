#!/usr/bin/env node
/**
 * Postversion hook for packages/mcp-server. When `npm version` bumps the
 * MCP server, propagate the same version string to every file that pins the
 * pluginos version: peer package.json manifests, the DXT manifest (both the
 * top-level `version` and its `server.mcp_config.args` pin), and the
 * hardcoded npx args inside the Figma plugin's UI sources.
 */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const newVersion = require(path.join(repoRoot, "packages/mcp-server/package.json")).version;

// Peer manifests: set top-level version field.
const packageTargets = [
  "packages/claude-plugin/package.json",
  "packages/claude-plugin/.claude-plugin/plugin.json",
  "packages/shared/package.json",
  "packages/bridge-plugin/package.json",
];

for (const rel of packageTargets) {
  const abs = path.join(repoRoot, rel);
  const j = JSON.parse(fs.readFileSync(abs, "utf8"));
  j.version = newVersion;
  fs.writeFileSync(abs, JSON.stringify(j, null, 2) + "\n");
  console.log(`Bumped ${rel} → ${newVersion}`);
}

// DXT manifest: bump both `version` and the version pinned in mcp_config.args.
const dxtManifestRel = "packages/mcp-server/dxt/manifest.json";
const dxtAbs = path.join(repoRoot, dxtManifestRel);
const dxt = JSON.parse(fs.readFileSync(dxtAbs, "utf8"));
dxt.version = newVersion;
if (Array.isArray(dxt?.server?.mcp_config?.args)) {
  dxt.server.mcp_config.args = dxt.server.mcp_config.args.map((a) =>
    /^pluginos@/.test(a) ? `pluginos@${newVersion}` : a
  );
}
fs.writeFileSync(dxtAbs, JSON.stringify(dxt, null, 2) + "\n");
console.log(`Bumped ${dxtManifestRel} → ${newVersion}`);

// Sources that hardcode `pluginos@<version>` in copy-paste MCP config snippets.
// These use a regex swap so formatting is preserved.
const sourceTargets = [
  "packages/bridge-plugin/src/ui-entry.ts",
  "packages/bridge-plugin/src/bootloader.html",
];

for (const rel of sourceTargets) {
  const abs = path.join(repoRoot, rel);
  const before = fs.readFileSync(abs, "utf8");
  const after = before.replace(/pluginos@\d+\.\d+\.\d+/g, `pluginos@${newVersion}`);
  if (after !== before) {
    fs.writeFileSync(abs, after);
    console.log(`Bumped ${rel} → pluginos@${newVersion}`);
  }
}
