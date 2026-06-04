import { describe, it, expect } from "vitest";
import { invalidVariableNameRule } from "../rules/invalid-variable-name.js";

describe("invalid-variable-name rule", () => {
  it("flags dot in variable name", () => {
    const code = `figma.variables.createVariable("Spacing/1.5", coll, "FLOAT");`;
    const results = invalidVariableNameRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain(".");
    expect(results[0].fix).toContain("1_5");
  });

  it("flags hyphen in variable name", () => {
    const code = `figma.variables.createVariable("body-medium", coll, "STRING");`;
    const results = invalidVariableNameRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].fix).toContain("body_medium");
  });

  it("flags space in variable name", () => {
    const code = `figma.variables.createVariable("body text", coll, "STRING");`;
    expect(invalidVariableNameRule.check(code)).toHaveLength(1);
  });

  it("does not flag valid names", () => {
    expect(
      invalidVariableNameRule.check(`figma.variables.createVariable("Spacing_1_5", coll, "FLOAT");`)
    ).toEqual([]);
    expect(
      invalidVariableNameRule.check(`figma.variables.createVariable("h1", coll, "STRING");`)
    ).toEqual([]);
  });
});
