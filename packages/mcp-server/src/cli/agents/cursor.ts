import { readFile, writeFile, rename, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface CursorOptions {
  configPath?: string;
}

export interface CursorResult {
  ok: boolean;
  configPath?: string;
  error?: string;
}

const PLUGINOS_ENTRY = {
  command: "npx",
  args: ["-y", "pluginos@latest"],
} as const;

function defaultConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomically(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export async function writeCursorMcpConfig(opts: CursorOptions = {}): Promise<CursorResult> {
  const configPath = opts.configPath ?? defaultConfigPath();

  await mkdir(dirname(configPath), { recursive: true });

  let parsed: Record<string, unknown> = {};
  if (await pathExists(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        configPath,
        error: `${configPath} contains invalid JSON — fix it first, then re-run`,
      };
    }
  }

  const mcpServers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.pluginos = PLUGINOS_ENTRY;
  parsed.mcpServers = mcpServers;

  await writeAtomically(configPath, JSON.stringify(parsed, null, 2) + "\n");

  return { ok: true, configPath };
}

export async function runCursorAgent(): Promise<number> {
  const result = await writeCursorMcpConfig();
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    return 1;
  }
  console.log(`✓ Cursor MCP config updated:`);
  console.log(`  ${result.configPath}`);
  console.log("");
  console.log("Restart Cursor to load the new server.");
  return 0;
}
