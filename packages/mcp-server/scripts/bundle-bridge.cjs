#!/usr/bin/env node
/**
 * Copies the built Figma bridge plugin files into mcp-server/dist/bridge/
 * so they ship in the npm tarball. Used by `pluginos install`.
 *
 * Also preserves the legacy dist/ui.html for any existing consumers of
 * that path.
 */
const { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const here = __dirname;
const pkgRoot = join(here, "..");
const bridgeDistSrc = join(pkgRoot, "../bridge-plugin/dist");
const mcpDist = join(pkgRoot, "dist");
const bridgeDistOut = join(mcpDist, "bridge");

const FILES = ["manifest.json", "code.js", "ui.html", "bootloader.html"];

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

ensureDir(mcpDist);
ensureDir(bridgeDistOut);

// manifest.json lives next to the source (not in dist/) for the bridge-plugin workspace
const manifestSrc = join(pkgRoot, "../bridge-plugin/manifest.json");

const sources = {
  "manifest.json": manifestSrc,
  "code.js": join(bridgeDistSrc, "code.js"),
  "ui.html": join(bridgeDistSrc, "ui.html"),
  "bootloader.html": join(bridgeDistSrc, "bootloader.html"),
};

for (const name of FILES) {
  const src = sources[name];
  if (!existsSync(src)) {
    console.error(
      `[bundle-bridge] missing ${src} — run \`npm run build -w packages/bridge-plugin\` first`
    );
    process.exit(1);
  }
  copyFileSync(src, join(bridgeDistOut, name));
}

// The source manifest references `dist/code.js` and `dist/bootloader.html`
// because importing the bridge-plugin's source manifest directly expects the
// built files under dist/. In the flat install layout that `pluginos install`
// produces (all four files side-by-side in ~/.pluginos/bridge/), those paths
// must be stripped to bare filenames or Figma will fail to import the manifest.
// Rewrite in place so the bundled manifest matches the bundled layout.
{
  const outManifest = join(bridgeDistOut, "manifest.json");
  const parsed = JSON.parse(readFileSync(outManifest, "utf8"));
  const stripDist = (p) => (typeof p === "string" ? p.replace(/^dist\//, "") : p);
  parsed.main = stripDist(parsed.main);
  parsed.ui = stripDist(parsed.ui);
  writeFileSync(outManifest, JSON.stringify(parsed, null, 2) + "\n");
}

// Legacy: keep dist/ui.html for existing HTTP server consumers
copyFileSync(join(bridgeDistSrc, "ui.html"), join(mcpDist, "ui.html"));

console.warn(`[bundle-bridge] copied ${FILES.length} files to ${bridgeDistOut}`);
