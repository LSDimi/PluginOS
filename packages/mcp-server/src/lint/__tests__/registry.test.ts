import { describe, it, expect } from "vitest";
import { runLint, registerRule } from "../index.js";
import type { LintRule } from "../types.js";

describe("lint registry", () => {
  it("returns empty array when no rules registered match", () => {
    expect(runLint("const x = 1;")).toEqual([]);
  });

  it("aggregates results from all rules", () => {
    const dummy: LintRule = {
      id: "dummy",
      severity: "error",
      check: () => [{ ruleId: "dummy", severity: "error", line: 1, message: "x" }],
    };
    registerRule(dummy);
    const results = runLint("anything");
    expect(results.some((r) => r.ruleId === "dummy")).toBe(true);
  });
});
