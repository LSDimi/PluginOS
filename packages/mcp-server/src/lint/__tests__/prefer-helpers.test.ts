import { describe, it, expect } from "vitest";
import { preferHelpersRule } from "../rules/prefer-helpers.js";

describe("prefer-helpers rule", () => {
  it("hints createStyledText when createText + loadFontAsync co-occur", () => {
    const code = `
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const t = figma.createText();
t.characters = "hi";
`;
    const results = preferHelpersRule.check(code);
    expect(results.some((r) => r.message.includes("createStyledText"))).toBe(true);
    expect(results.every((r) => r.severity === "hint")).toBe(true);
  });

  it("hints bindSpacing when 3+ padding bindings are set", () => {
    const code = `
node.setBoundVariable("paddingTop", v);
node.setBoundVariable("paddingBottom", v);
node.setBoundVariable("paddingLeft", v);
`;
    const results = preferHelpersRule.check(code);
    expect(results.some((r) => r.message.includes("bindSpacing"))).toBe(true);
  });

  it("does not hint for unrelated code", () => {
    expect(preferHelpersRule.check(`const x = 1;`)).toEqual([]);
  });
});
