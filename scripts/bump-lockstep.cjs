#!/usr/bin/env node
/**
 * Postversion hook for packages/mcp-server. When `npm version` bumps the
 * MCP server, propagate the same version string to the four peer manifests
 * so the version-lockstep check stays green.
 */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const newVersion = require(path.join(repoRoot, "packages/mcp-server/package.json")).version;

const targets = [
  "packages/claude-plugin/package.json",
  "packages/claude-plugin/.claude-plugin/plugin.json",
  "packages/shared/package.json",
  "packages/bridge-plugin/package.json",
];

for (const rel of targets) {
  const abs = path.join(repoRoot, rel);
  const j = JSON.parse(fs.readFileSync(abs, "utf8"));
  j.version = newVersion;
  fs.writeFileSync(abs, JSON.stringify(j, null, 2) + "\n");
  console.log(`Bumped ${rel} → ${newVersion}`);
}
