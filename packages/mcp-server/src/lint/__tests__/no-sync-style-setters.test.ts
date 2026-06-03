import { describe, it, expect } from "vitest";
import { noSyncStyleSettersRule } from "../rules/no-sync-style-setters.js";

describe("no-sync-style-setters rule", () => {
  it.each([
    ["node.fillStyleId = id;", "fillStyleId"],
    ["foo.textStyleId = '123';", "textStyleId"],
    ["x.strokeStyleId='abc'", "strokeStyleId"],
    ["a.effectStyleId = 'eee';", "effectStyleId"],
    ["b.gridStyleId='ggg';", "gridStyleId"],
  ])("flags %s", (code, field) => {
    const results = noSyncStyleSettersRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warn");
    expect(results[0].message).toContain(field);
  });

  it("does not flag async setters", () => {
    expect(noSyncStyleSettersRule.check(`await node.setFillStyleIdAsync(id);`)).toEqual([]);
  });

  it("does not flag reads", () => {
    expect(noSyncStyleSettersRule.check(`const id = node.fillStyleId;`)).toEqual([]);
  });
});
