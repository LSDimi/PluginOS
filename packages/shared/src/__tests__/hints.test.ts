import { describe, it, expect } from "vitest";
import { withHint } from "../hints";

describe("withHint", () => {
  it("adds _hint when provided", () => {
    expect(withHint({ value: 1 }, "do X")).toEqual({ value: 1, _hint: "do X" });
  });
  it("adds _next_hints when provided and non-empty", () => {
    expect(withHint({ value: 1 }, undefined, ["a", "b"])).toEqual({
      value: 1,
      _next_hints: ["a", "b"],
    });
  });
  it("adds both when both provided", () => {
    expect(withHint({ value: 1 }, "X", ["a"])).toEqual({ value: 1, _hint: "X", _next_hints: ["a"] });
  });
  it("adds neither when both omitted", () => {
    expect(withHint({ value: 1 })).toEqual({ value: 1 });
  });
  it("does not add _next_hints when empty array passed", () => {
    expect(withHint({ value: 1 }, undefined, [])).toEqual({ value: 1 });
  });
});
