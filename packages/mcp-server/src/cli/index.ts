import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(dir, "..", "..", "package.json"),
    join(dir, "..", "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (pkg.name === "pluginos" && typeof pkg.version === "string") return pkg.version;
    } catch {
      // try next
    }
  }
  return "0.0.0";
}

export function printUsage(): void {
  console.log("pluginos — agent-native Figma operations platform");
  console.log("");
  console.log("Usage:");
  console.log("  pluginos                          start the MCP server (default)");
  console.log("  pluginos install                  install the Figma bridge plugin");
  console.log("  pluginos install --with-agent N   also write MCP config for agent N");
  console.log("                                    (N: cursor | generic)");
  console.log("  pluginos --help                   show this help");
  console.log("  pluginos --version                show the installed version");
}

export function printVersion(): void {
  console.log(readPackageVersion());
}

export async function runCli(args: string[]): Promise<number> {
  const subcommand = args[0];
  switch (subcommand) {
    case "install":
      console.log("install: not yet implemented");
      return 0;
    case "--help":
    case "-h":
      printUsage();
      return 0;
    case "--version":
    case "-v":
      printVersion();
      return 0;
    default:
      console.log(`unknown subcommand: ${subcommand ?? "(none)"}`);
      printUsage();
      return 1;
  }
}

const isDirectExecution = process.argv[1] && process.argv[1].endsWith("cli/index.js");
if (isDirectExecution) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
