// packages/mcp-server/src/lint/types.ts
export type LintSeverity = "error" | "warn" | "hint";

export interface LintResult {
  ruleId: string;
  severity: LintSeverity;
  line: number;
  message: string;
  fix?: string;
}

export interface LintRule {
  id: string;
  severity: LintSeverity;
  check(code: string): LintResult[];
}
