import { describe, it, expect } from "vitest";
import { noNotifyRule } from "../rules/no-notify.js";

describe("no-notify rule", () => {
  it("flags figma.notify calls", () => {
    const results = noNotifyRule.check(`figma.notify("hi");`);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("no-notify");
    expect(results[0].severity).toBe("error");
    expect(results[0].line).toBe(1);
  });

  it("flags figma.notify on later line with correct line number", () => {
    const code = `const x = 1;\nconst y = 2;\nfigma.notify("hi");`;
    const results = noNotifyRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe(3);
  });

  it("does not flag .notify on other objects", () => {
    expect(noNotifyRule.check(`emitter.notify("hi");`)).toEqual([]);
  });

  it("does not flag in code without notify", () => {
    expect(noNotifyRule.check(`const x = 1;`)).toEqual([]);
  });
});
