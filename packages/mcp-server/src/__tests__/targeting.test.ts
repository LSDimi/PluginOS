import { describe, it, expect } from "vitest";
import { resolveFileTarget } from "../targeting.js";

const files = new Map([
  ["syn_abc12345", { fileName: "Design System" }],
  ["realkey9", { fileName: "Marketing Site" }],
]);

describe("resolveFileTarget (F2b)", () => {
  it("no request → active key", () => {
    expect(resolveFileTarget(files, undefined, "realkey9")).toEqual({ key: "realkey9" });
  });
  it("no request, nothing active → error", () => {
    expect(resolveFileTarget(new Map(), undefined, null)).toHaveProperty("error");
  });
  it("exact key match wins", () => {
    expect(resolveFileTarget(files, "syn_abc12345", null)).toEqual({ key: "syn_abc12345" });
  });
  it("unique case-insensitive fileName match", () => {
    const r = resolveFileTarget(files, "design system", null) as { key: string; note?: string };
    expect(r.key).toBe("syn_abc12345");
    expect(r.note).toContain("matched by file name");
  });
  it("unknown key with exactly one file → routed with note", () => {
    const one = new Map([["syn_x", { fileName: "Only File" }]]);
    const r = resolveFileTarget(one, "SomeRealKey123", null) as { key: string; note?: string };
    expect(r.key).toBe("syn_x");
    expect(r.note).toContain("only connected file");
  });
  it("unknown key with multiple files → error listing files", () => {
    const r = resolveFileTarget(files, "nope", null) as { error: string };
    expect(r.error).toContain("Design System");
    expect(r.error).toContain("Marketing Site");
  });
});
