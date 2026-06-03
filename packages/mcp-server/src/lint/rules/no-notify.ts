import type { LintRule, LintResult } from "../types.js";

const PATTERN = /\bfigma\.notify\s*\(/g;

export const noNotifyRule: LintRule = {
  id: "no-notify",
  severity: "error",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (PATTERN.test(lines[i])) {
        out.push({
          ruleId: "no-notify",
          severity: "error",
          line: i + 1,
          message: "figma.notify() is forbidden in the plugin sandbox. Remove the call.",
        });
        PATTERN.lastIndex = 0;
      }
    }
    return out;
  },
};
