import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRELUDE_SOURCE } from "./source.js";

function readPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(dir, "..", "..", "package.json"),
    join(dir, "..", "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (
        typeof pkg.name === "string" &&
        (pkg.name === "pluginos" || pkg.name.includes("pluginos")) &&
        typeof pkg.version === "string"
      ) {
        return pkg.version;
      }
    } catch {
      // try next
    }
  }
  return "0.0.0";
}

export const PRELUDE_VERSION: string = readPackageVersion();

const RESOLVED_PRELUDE = PRELUDE_SOURCE.replace("__PRELUDE_VERSION__", PRELUDE_VERSION);
const PRELUDE_LINES = RESOLVED_PRELUDE.split("\n").length;

export function wrapScript(userJs: string): { wrapped: string; preludeLineCount: number } {
  return {
    wrapped: RESOLVED_PRELUDE + userJs,
    preludeLineCount: PRELUDE_LINES - 1,
  };
}
