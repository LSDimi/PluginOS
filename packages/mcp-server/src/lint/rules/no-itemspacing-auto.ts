import type { LintRule, LintResult } from "../types.js";

const PATTERN = /itemSpacing\s*[:=]\s*["']AUTO["']/;

export const noItemSpacingAutoRule: LintRule = {
  id: "no-itemspacing-auto",
  severity: "error",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (PATTERN.test(lines[i])) {
        out.push({
          ruleId: "no-itemspacing-auto",
          severity: "error",
          line: i + 1,
          message: 'itemSpacing = "AUTO" is rejected at runtime. Use PluginOS.layoutSpaceBetween(frame, { growChild }) instead.',
        });
      }
    }
    return out;
  },
};
