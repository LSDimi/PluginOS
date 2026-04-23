#!/usr/bin/env node
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const dxtDir = join(pkgRoot, "dxt");
const distDir = join(pkgRoot, "dist");
const outFile = join(distDir, "pluginos.dxt");

const manifestPath = join(dxtDir, "manifest.json");
const iconPath = join(dxtDir, "icon.png");

if (!existsSync(manifestPath)) {
  console.error(`[build-dxt] missing ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  console.error(
    `[build-dxt] version mismatch: manifest=${manifest.version} package=${pkg.version}`
  );
  process.exit(1);
}

if (Array.isArray(manifest?.server?.mcp_config?.args)) {
  const versioned = manifest.server.mcp_config.args.find((a) =>
    /^pluginos@/.test(a)
  );
  if (versioned && versioned !== `pluginos@${pkg.version}`) {
    console.error(
      `[build-dxt] manifest mcp_config args pin ${versioned} but package is ${pkg.version}`
    );
    process.exit(1);
  }
}

mkdirSync(distDir, { recursive: true });

const zip = new AdmZip();
zip.addLocalFile(manifestPath);
if (existsSync(iconPath)) zip.addLocalFile(iconPath);
zip.writeZip(outFile);

console.log(`[build-dxt] wrote ${outFile}`);
