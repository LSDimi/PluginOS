import { describe, it, expect } from "vitest";
import { resolveBindingState } from "../checks/binding";

const base = { id: "1", name: "n", type: "RECTANGLE" } as any;

describe("resolveBindingState (fill)", () => {
  it("returns 'style' when fillStyleId is a non-empty string", () => {
    const node = { ...base, fillStyleId: "S:abc", fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }] };
    expect(resolveBindingState(node, "fill")).toBe("style");
  });

  it("returns 'variable' when every solid paint has boundVariables.color", () => {
    const node = {
      ...base,
      fillStyleId: "",
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: "V:1" } } }],
    };
    expect(resolveBindingState(node, "fill")).toBe("variable");
  });

  it("returns 'raw' when a solid paint has neither style nor variable", () => {
    const node = { ...base, fillStyleId: "", fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }] };
    expect(resolveBindingState(node, "fill")).toBe("raw");
  });

  it("treats figma.mixed styleId as not-a-style (falls through)", () => {
    const node = { ...base, fillStyleId: Symbol("mixed"), fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }] };
    expect(resolveBindingState(node, "fill")).toBe("raw");
  });

  it("returns 'raw' when a node mixes a variable-bound solid and a raw solid", () => {
    const node = {
      ...base,
      fillStyleId: "",
      fills: [
        { type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: "V:1" } } },
        { type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } },
      ],
    };
    expect(resolveBindingState(node, "fill")).toBe("raw");
  });
});

describe("resolveBindingState (text)", () => {
  it("returns 'style' with a text style id, else 'raw'", () => {
    expect(resolveBindingState({ ...base, type: "TEXT", textStyleId: "T:1" } as any, "text")).toBe("style");
    expect(resolveBindingState({ ...base, type: "TEXT", textStyleId: "" } as any, "text")).toBe("raw");
  });
});
