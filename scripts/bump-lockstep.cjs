#!/usr/bin/env node
/**
 * Postversion hook for packages/mcp-server. When `npm version` bumps the
 * MCP server, propagate the same version string to every file that pins the
 * pluginos version: peer package.json manifests and the DXT manifest (both
 * the top-level `version` and its `server.mcp_config.args` pin).
 *
 * Note: the Figma plugin UI (`bridge-plugin/src/ui-entry.ts` and
 * `bootloader.html`) reads `mcp-server/package.json#version` at webpack
 * build time, so no source-file rewrite is needed there.
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
