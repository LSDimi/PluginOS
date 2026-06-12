import type { LintRule, LintResult } from "../types.js";

const SET_PLUGIN_DATA = /setPluginData\s*\(\s*["']([^"']+)["']/g;
const SET_SHARED = /setSharedPluginData\s*\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/g;

export const noHyphenatedPluginDataKeyRule: LintRule = {
  id: "no-hyphenated-plugindata-key",
  severity: "error",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of [SET_PLUGIN_DATA, SET_SHARED]) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line)) !== null) {
          const key = m[1];
          if (key.includes("-")) {
            out.push({
              ruleId: "no-hyphenated-plugindata-key",
              severity: "error",
              line: i + 1,
              message: `Plugin data key "${key}" contains a hyphen. Use underscore: "${key.replace(/-/g, "_")}".`,
              fix: key.replace(/-/g, "_"),
            });
          }
        }
      }
    }
    return out;
  },
};
