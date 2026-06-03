import { describe, it, expect } from "vitest";
import { noItemSpacingAutoRule } from "../rules/no-itemspacing-auto.js";

describe("no-itemspacing-auto rule", () => {
  it.each([
    `frame.itemSpacing = "AUTO";`,
    `frame.itemSpacing = 'AUTO';`,
    `{ itemSpacing: "AUTO" }`,
    `{itemSpacing:'AUTO'}`,
  ])("flags %s", (code) => {
    const results = noItemSpacingAutoRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
  });

  it("does not flag numeric itemSpacing", () => {
    expect(noItemSpacingAutoRule.check(`frame.itemSpacing = 16;`)).toEqual([]);
  });
});
