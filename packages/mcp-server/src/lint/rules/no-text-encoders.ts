import type { LintRule, LintResult } from "../types.js";

const PATTERNS: Array<[RegExp, string]> = [
  [/\bTextEncoder\b/, "TextEncoder"],
  [/\bTextDecoder\b/, "TextDecoder"],
  [/\bcrypto\.subtle\b/, "crypto.subtle"],
];

export const noTextEncodersRule: LintRule = {
  id: "no-text-encoders",
  severity: "error",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const [pattern, name] of PATTERNS) {
        if (pattern.test(lines[i])) {
          out.push({
            ruleId: "no-text-encoders",
            severity: "error",
            line: i + 1,
            message: `${name} is unavailable in the Figma plugin sandbox. Compute via plain JS string/array operations.`,
          });
        }
      }
    }
    return out;
  },
};
