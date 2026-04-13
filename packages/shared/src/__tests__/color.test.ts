import { describe, it, expect } from "vitest";
import { hexToRgb } from "../color.js";

describe("hexToRgb", () => {
  it("parses #RRGGBB format", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb("#00FF00")).toEqual({ r: 0, g: 1, b: 0 });
    expect(hexToRgb("#0000FF")).toEqual({ r: 0, g: 0, b: 1 });
  });

  it("parses without # prefix", () => {
    expect(hexToRgb("FF0000")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("returns 0-1 range values", () => {
    const { r, g, b } = hexToRgb("#808080");
    expect(r).toBeCloseTo(128 / 255, 5);
    expect(g).toBeCloseTo(128 / 255, 5);
    expect(b).toBeCloseTo(128 / 255, 5);
  });

  it("handles black and white", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#ff3366")).toEqual(hexToRgb("#FF3366"));
  });
});
