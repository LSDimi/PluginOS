import { readFile, writeFile, rename, mkdir, access, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export interface InstallOptions {
  sourceDir?: string;
  targetDir?: string;
}

export interface InstallResult {
  ok: boolean;
  action?: "installed" | "updated";
  version?: string;
  error?: string;
}

const BRIDGE_FILES = ["manifest.json", "code.js", "ui.html", "bootloader.html"] as const;

function defaultSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "bridge");
}

function defaultTargetDir(): string {
  return join(homedir(), ".pluginos", "bridge");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readBridgeVersion(manifestPath: string): Promise<string | null> {
  try {
    const text = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(text) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

async function copyAtomically(src: string, dest: string): Promise<void> {
  const tmp = `${dest}.tmp`;
  const content = await readFile(src);
  await writeFile(tmp, content);
  await rename(tmp, dest);
}

export async function installBridge(opts: InstallOptions = {}): Promise<InstallResult> {
  const sourceDir = opts.sourceDir ?? defaultSourceDir();
  const targetDir = opts.targetDir ?? defaultTargetDir();

  for (const name of BRIDGE_FILES) {
    if (!(await pathExists(join(sourceDir, name)))) {
      return {
        ok: false,
        error: `missing source file: ${name} (looked in ${sourceDir})`,
      };
    }
  }

  const targetManifest = join(targetDir, "manifest.json");
  const alreadyInstalled = await pathExists(targetManifest);
  const action: "installed" | "updated" = alreadyInstalled ? "updated" : "installed";

  await mkdir(targetDir, { recursive: true });
  await chmod(targetDir, 0o700).catch(() => {});

  for (const name of BRIDGE_FILES) {
    await copyAtomically(join(sourceDir, name), join(targetDir, name));
  }

  const version = (await readBridgeVersion(join(targetDir, "manifest.json"))) ?? "?";
  return { ok: true, action, version };
}

export async function runInstall(args: string[]): Promise<number> {
  const withAgentIdx = args.indexOf("--with-agent");
  const agent = withAgentIdx >= 0 ? args[withAgentIdx + 1] : null;

  const result = await installBridge();
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    console.error("Try: npm install -g pluginos@latest");
    return 1;
  }

  const verb = result.action === "updated" ? "✓ updated to" : "✓ PluginOS Bridge";
  const target = join(homedir(), ".pluginos", "bridge");
  console.log(`${verb} v${result.version} installed to:`);
  console.log(`  ${target}`);
  console.log("");
  console.log("Next: open Figma → Plugins → Development → Import plugin from manifest…");
  console.log(`      and select: ${join(target, "manifest.json")}`);
  console.log("");
  console.log('Then run "PluginOS Bridge" from the Plugins menu and you\'re connected.');

  if (agent) {
    console.log("");
    console.log(`(--with-agent ${agent}: not yet wired in this task)`);
  }

  return 0;
}
