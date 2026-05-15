#!/usr/bin/env node
/**
 * Bundles the built Figma plugin into a versioned zip for GitHub Releases.
 * Output: packages/bridge-plugin/dist/pluginos-bridge-v<version>.zip
 *
 * Contents:
 *   manifest.json          (copied from packages/bridge-plugin)
 *   dist/code.js
 *   dist/bootloader.html
 *   dist/ui.html
 *   INSTALL.txt            (generated per-build)
 */
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const distDir = join(pkgRoot, "dist");

const requiredFiles = ["code.js", "bootloader.html", "ui.html"];
for (const f of requiredFiles) {
  if (!existsSync(join(distDir, f))) {
    console.error(`[package-bridge] missing dist/${f} — run \`npm run build -w packages/bridge-plugin\` first`);
    process.exit(1);
  }
}

const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const manifestPath = join(pkgRoot, "manifest.json");
const manifest = readFileSync(manifestPath);
const outFile = join(distDir, `pluginos-bridge-v${pkg.version}.zip`);

const installTxt = `PluginOS Bridge v${pkg.version} — install guide

1. In Figma, open the menu: Plugins -> Development -> Import plugin from manifest...
2. Select the manifest.json from this folder.
3. PluginOS Bridge will now be available under Plugins -> Development.

Full setup (including the agent-side MCP server):
  https://github.com/LSDimi/pluginos#install-in-60-seconds
`;

mkdirSync(distDir, { recursive: true });

const zip = new AdmZip();
zip.addFile("manifest.json", manifest);
zip.addLocalFile(join(distDir, "code.js"), "dist");
zip.addLocalFile(join(distDir, "bootloader.html"), "dist");
zip.addLocalFile(join(distDir, "ui.html"), "dist");
zip.addFile("INSTALL.txt", Buffer.from(installTxt, "utf8"));
zip.writeZip(outFile);

console.log(`[package-bridge] wrote ${outFile}`);
