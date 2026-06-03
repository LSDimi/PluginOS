import type { LintResult, LintRule } from "./types.js";

const rules: LintRule[] = [];

export function registerRule(rule: LintRule): void {
  rules.push(rule);
}

export function runLint(code: string): LintResult[] {
  const out: LintResult[] = [];
  for (const rule of rules) {
    for (const result of rule.check(code)) {
      out.push(result);
    }
  }
  return out;
}

export type { LintResult, LintRule, LintSeverity } from "./types.js";
