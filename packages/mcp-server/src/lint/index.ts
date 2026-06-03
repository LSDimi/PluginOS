import type { LintResult, LintRule } from "./types.js";
import { noNotifyRule } from "./rules/no-notify.js";
import { noSyncStyleSettersRule } from "./rules/no-sync-style-setters.js";
import { noItemSpacingAutoRule } from "./rules/no-itemspacing-auto.js";
import { invalidVariableNameRule } from "./rules/invalid-variable-name.js";
import { noHyphenatedPluginDataKeyRule } from "./rules/no-hyphenated-plugindata-key.js";
import { noTextEncodersRule } from "./rules/no-text-encoders.js";
import { preferHelpersRule } from "./rules/prefer-helpers.js";

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

// Register default ruleset
registerRule(noNotifyRule);
registerRule(noSyncStyleSettersRule);
registerRule(noItemSpacingAutoRule);
registerRule(invalidVariableNameRule);
registerRule(noHyphenatedPluginDataKeyRule);
registerRule(noTextEncodersRule);
registerRule(preferHelpersRule);

export type { LintResult, LintRule, LintSeverity } from "./types.js";
