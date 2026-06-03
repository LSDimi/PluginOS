import type { LintRule, LintResult } from "../types.js";

const PADDING_FIELDS = ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "itemSpacing"];

export const preferHelpersRule: LintRule = {
  id: "prefer-helpers",
  severity: "hint",
  check(code: string): LintResult[] {
    const out: LintResult[] = [];
    const lines = code.split("\n");
    const hasCreateText = /\bfigma\.createText\s*\(/.test(code);
    const hasLoadFont = /\bfigma\.loadFontAsync\s*\(/.test(code);
    if (hasCreateText && hasLoadFont) {
      const idx = lines.findIndex((l) => /\bfigma\.createText\s*\(/.test(l));
      out.push({
        ruleId: "prefer-helpers",
        severity: "hint",
        line: idx + 1,
        message:
          "Consider PluginOS.createStyledText({ characters, textStyleId, family, weight, size, fillStyleId, name }) — handles font load + create + style binding in one call.",
      });
    }
    let paddingCount = 0;
    let firstPaddingLine = -1;
    for (let i = 0; i < lines.length; i++) {
      for (const field of PADDING_FIELDS) {
        const pattern = new RegExp(`setBoundVariable\\s*\\(\\s*["']${field}["']`);
        if (pattern.test(lines[i])) {
          paddingCount++;
          if (firstPaddingLine === -1) firstPaddingLine = i + 1;
        }
      }
    }
    if (paddingCount >= 3) {
      out.push({
        ruleId: "prefer-helpers",
        severity: "hint",
        line: firstPaddingLine,
        message:
          "Consider PluginOS.bindSpacing(node, { padding, itemSpacing }) — binds all padding/itemSpacing fields in one call.",
      });
    }
    return out;
  },
};
