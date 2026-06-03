import type { LintRule, LintResult } from "../types.js";

const FIELDS = ["fillStyleId", "textStyleId", "strokeStyleId", "effectStyleId", "gridStyleId"];
const PATTERN = new RegExp(`\\.(${FIELDS.join("|")})\\s*=\\s*[^=]`);

export const noSyncStyleSettersRule: LintRule = {
  id: "no-sync-style-setters",
  severity: "warn",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(PATTERN);
      if (m) {
        const field = m[1];
        out.push({
          ruleId: "no-sync-style-setters",
          severity: "warn",
          line: i + 1,
          message: `Sync setter '.${field} = ...' is deprecated. Use .set${field.charAt(0).toUpperCase() + field.slice(1)}Async(...).`,
          fix: `await node.set${field.charAt(0).toUpperCase() + field.slice(1)}Async(...)`,
        });
      }
    }
    return out;
  },
};
