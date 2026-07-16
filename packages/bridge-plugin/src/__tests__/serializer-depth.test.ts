import { describe, it, expect } from "vitest";
import { safeSerialize } from "../utils/serializer";

describe("safeSerialize depth handling (F1)", () => {
  // a=1, b=2, c=3, d=4, e=5 — e's values are walked at depth 6 (> maxDepth 5)
  const input = { a: { b: { c: { d: { e: { r: 0.42, s: "hex", deeper: { g: 1 } } } } } } };

  it("preserves scalar leaves beyond maxDepth", () => {
    const out = safeSerialize(input) as any;
    expect(out.a.b.c.d.e.r).toBe(0.42);
    expect(out.a.b.c.d.e.s).toBe("hex");
  });

  it("still truncates containers beyond maxDepth", () => {
    const out = safeSerialize(input) as any;
    expect(out.a.b.c.d.e.deeper).toBe("[max depth]");
  });

  it("keeps circular and array-cap behavior", () => {
    const circ: any = { name: "x" };
    circ.self = circ;
    expect((safeSerialize(circ) as any).self).toBe("[circular]");
    const big = { arr: Array.from({ length: 250 }, (_, i) => i) };
    const out = safeSerialize(big) as any;
    expect(out.arr).toHaveLength(201);
    expect(out.arr[200]).toBe("[...50 more items]");
  });
});
