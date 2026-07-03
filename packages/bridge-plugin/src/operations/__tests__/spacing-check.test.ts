import { describe, it, expect, beforeEach } from "vitest";
import { checkSpacing } from "../checks/spacing";
import { getOperation } from "../index";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

function frame(vals: Partial<Record<string, number>>) {
  return {
    id: "f",
    name: "F",
    type: "FRAME",
    layoutMode: "VERTICAL",
    itemSpacing: vals.itemSpacing ?? 0,
    paddingLeft: vals.paddingLeft ?? 0,
    paddingRight: vals.paddingRight ?? 0,
    paddingTop: vals.paddingTop ?? 0,
    paddingBottom: vals.paddingBottom ?? 0,
    counterAxisSpacing: null,
  } as any;
}

describe("checkSpacing", () => {
  it("flags values that are not multiples of base_unit", () => {
    const r = checkSpacing(frame({ itemSpacing: 9, paddingLeft: 16 }), 8);
    expect(r.violations.map((v) => (v.meta as any).value)).toEqual([9]);
  });
  it("baseUnit<=0 disables grid violations", () => {
    expect(checkSpacing(frame({ itemSpacing: 9 }), 0).violations).toEqual([]);
  });
});

describe("audit_spacing base_unit default", () => {
  it("flags off-grid values against the default 8px grid", async () => {
    const nodes = [frame({ itemSpacing: 9, paddingLeft: 13, paddingTop: 16 })];
    const result: any = await getOperation("audit_spacing")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);
    expect(result.total_violations).toBe(2);
    expect(result.unique_values).toEqual([0, 9, 13, 16]);
  });
});
