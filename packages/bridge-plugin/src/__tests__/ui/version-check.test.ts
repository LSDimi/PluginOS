import { describe, it, expect } from "vitest";
import { isCompatible, parseMajor } from "../../ui/version-check";

describe("version compatibility", () => {
  it("parses major version", () => {
    expect(parseMajor("0.4.3")).toBe(0);
    expect(parseMajor("1.2.0")).toBe(1);
    expect(parseMajor("12.34.56")).toBe(12);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseMajor("garbage")).toBe(0);
    expect(parseMajor("")).toBe(0);
  });

  it("treats matching majors as compatible", () => {
    expect(isCompatible("0.4.3", "0.5.0")).toBe(true);
    expect(isCompatible("1.0.0", "1.99.0")).toBe(true);
  });

  it("treats differing majors as incompatible", () => {
    expect(isCompatible("0.4.3", "1.0.0")).toBe(false);
    expect(isCompatible("2.0.0", "1.0.0")).toBe(false);
  });
});
