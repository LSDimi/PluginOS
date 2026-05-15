import { describe, it, expect } from "vitest";
import { isCompatible, parseMajor, parseMinor } from "../../ui/version-check";

describe("version compatibility", () => {
  it("parses major version", () => {
    expect(parseMajor("0.4.3")).toBe(0);
    expect(parseMajor("1.2.0")).toBe(1);
    expect(parseMajor("12.34.56")).toBe(12);
  });

  it("parses minor version", () => {
    expect(parseMinor("0.4.3")).toBe(4);
    expect(parseMinor("1.20.0")).toBe(20);
    expect(parseMinor("garbage")).toBe(0);
  });

  it("returns 0 for unparseable major input", () => {
    expect(parseMajor("garbage")).toBe(0);
    expect(parseMajor("")).toBe(0);
  });

  it("treats matching majors as compatible when major >= 1", () => {
    expect(isCompatible("1.0.0", "1.99.0")).toBe(true);
    expect(isCompatible("2.5.0", "2.0.1")).toBe(true);
  });

  it("treats differing majors as incompatible", () => {
    expect(isCompatible("0.4.3", "1.0.0")).toBe(false);
    expect(isCompatible("2.0.0", "1.0.0")).toBe(false);
  });

  it("treats differing minors as incompatible when major is 0", () => {
    expect(isCompatible("0.4.3", "0.5.0")).toBe(false);
    expect(isCompatible("0.0.1", "0.1.0")).toBe(false);
  });

  it("treats matching minors as compatible when major is 0", () => {
    expect(isCompatible("0.4.0", "0.4.9")).toBe(true);
    expect(isCompatible("0.0.1", "0.0.99")).toBe(true);
  });
});
