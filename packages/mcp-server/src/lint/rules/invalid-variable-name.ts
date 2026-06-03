import type { LintRule, LintResult } from "../types.js";

const CALL = /createVariable\s*\(\s*["']([^"']+)["']/g;
const VALID = /^[A-Za-z0-9_/]+$/;

export const invalidVariableNameRule: LintRule = {
  id: "invalid-variable-name",
  severity: "error",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CALL.exec(line)) !== null) {
        const name = m[1];
        if (!VALID.test(name)) {
          const bad = [...name].find((ch) => !/[A-Za-z0-9_/]/.test(ch)) ?? "?";
          const sanitized = name.replace(/[^A-Za-z0-9_/]/g, "_");
          out.push({
            ruleId: "invalid-variable-name",
            severity: "error",
            line: i + 1,
            message: `Variable name "${name}" contains invalid character "${bad}". Use [A-Za-z0-9_] (slashes allowed for nesting).`,
            fix: sanitized,
          });
        }
      }
    }
    return out;
  },
};
